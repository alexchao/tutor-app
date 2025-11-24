import { DBOS } from "@dbos-inc/dbos-sdk";
import { streamObject } from 'ai';
import { openai } from '../../../lib/openai.js';
import { z } from 'zod';
import { db } from '../../../db/connection.js';
import { practiceQuestionSubmissions, learningTopics } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { interpolatePromptVariables } from '../../../utils/interpolate-prompt-variables.js';

// Grading prompt template
const gradingPromptTemplate = `You are grading a student's response to a practice question about a learning topic.

<topic_title>
{{topicTitle}}
</topic_title>

<source_material>
{{topicContent}}
</source_material>

<question_prompt>
{{questionPrompt}}
</question_prompt>

<student_response>
{{studentResponse}}
</student_response>

Based on the source material, identify 3-7 concrete criteria that the response should have covered. The number of criteria should be proportional to the scope and length of the source material.
  
## Criteria Selection

Each criterion should be a single concept or idea that the student should have covered in their response

- Narrow in scope: Criteria should be narrowly focused on a single concept or idea. Do not include multiple concepts in a single criterion.
- Grounded in the source material: Only include criteria that directly relate to the content of the source material. Do NOT include any criteria regarding the format, grammar, style, etc. of the response.
- Avoid overlap: Do not include criteria that are essentially the same thing or that have significant conceptual overlap.

## Criteria Titles

- Write a short title for each criterion (3-8 words)
  
## Criteria Judgment

For each criterion, evaluate whether it was:
- SATISFIED: The student clearly addressed this criterion
- PARTIALLY_SATISFIED: The student mentioned it but incompletely or with errors
- NOT_SATISFIED: The student did not address this criterion

## Feedback Guidance

- If the student satisfied the criterion, provide specific feedback on what they did well. Keep positive feedback short.
- If the student did not satisfy the criterion, provide specific feedback on what they missed or got wrong, and what they needed to have said to satisfy the criterion.
- Feedback format (for each criterion) should be a single paragraph of text (1-2 sentences, AT MOST 3 short sentences). You may use **markdown bold** to emphasize key points. Do NOT use any other markdown formatting.
  
### Feedback Language

- Straightforward and objective.
- Avoid pleasantries.
- Do NOT mention "the source" in any way; simply speak as if referencing factual knowledge.
  - e.g. Rather than "The source explains that the French Revolution was caused by...", simply say "The French Revolution was caused by...".

Example feedback: 'You hinted at the correct idea by saying "<direct quote from student response>". However, you didn't explicitly explain that [...]. Expand on what [...] means in practice.'

## Output Format

Return a JSON object with an array of criteria, each containing:
- title: A concise name for the criterion
- result: SATISFIED | PARTIALLY_SATISFIED | NOT_SATISFIED
- feedbackMd: Specific feedback with **markdown formatting** explaining why this result was given`;

// Grading result schema
const criterionSchema = z.object({
  title: z.string(),
  result: z.enum(['SATISFIED', 'PARTIALLY_SATISFIED', 'NOT_SATISFIED']),
  feedbackMd: z.string(),
});

const gradingResultSchema = z.object({
  criteria: z.array(criterionSchema),
});

interface GradeSubmissionInput {
  submissionId: number;
}

async function performGradingStep(
  topicTitle: string,
  topicContent: string,
  questionPrompt: string,
  studentResponse: string
): Promise<z.infer<typeof gradingResultSchema>> {
  const prompt = interpolatePromptVariables(gradingPromptTemplate, {
    topicTitle,
    topicContent,
    questionPrompt,
    studentResponse,
  });

  const { partialObjectStream } = streamObject({
    model: openai('gpt-5.1-2025-11-13'),
    schema: gradingResultSchema,
    prompt,
  });

  // Consume the stream and get the final result
  let finalResult;
  for await (const partialObject of partialObjectStream) {
    console.log('partialObject', partialObject);
    finalResult = partialObject;
  }

  if (!finalResult) {
    throw new Error('Failed to get grading result from LLM');
  }

  // Validate the final result matches our schema
  const validatedResult = gradingResultSchema.parse(finalResult);
  return validatedResult;
}

async function saveGradingResultStep(
  submissionId: number,
  gradingResult: z.infer<typeof gradingResultSchema>
): Promise<void> {
  await db
    .update(practiceQuestionSubmissions)
    .set({
      gradingResult: gradingResult as any,
      gradingCompletedAt: new Date(),
    })
    .where(eq(practiceQuestionSubmissions.id, submissionId));
}

async function gradeSubmissionWorkflowFunction(
  input: GradeSubmissionInput
): Promise<void> {
  const { submissionId } = input;

  // Fetch submission and topic data
  const [submission] = await db
    .select()
    .from(practiceQuestionSubmissions)
    .where(eq(practiceQuestionSubmissions.id, submissionId))
    .limit(1);

  if (!submission) {
    throw new Error(`Submission ${submissionId} not found`);
  }

  const [topic] = await db
    .select()
    .from(learningTopics)
    .where(eq(learningTopics.id, submission.learningTopicId))
    .limit(1);

  if (!topic) {
    throw new Error(`Topic ${submission.learningTopicId} not found`);
  }

  // Mark grading as started
  await db
    .update(practiceQuestionSubmissions)
    .set({ gradingStartedAt: new Date() })
    .where(eq(practiceQuestionSubmissions.id, submissionId));

  // Step 1: Perform grading using LLM
  const gradingResult = await DBOS.runStep(
    () => performGradingStep(
      topic.title,
      topic.contentMd,
      submission.questionPrompt,
      submission.studentResponse
    ),
    { name: 'performGrading', retriesAllowed: true, intervalSeconds: 2, maxAttempts: 3 }
  );

  // Step 2: Save results to database
  await DBOS.runStep(
    () => saveGradingResultStep(submissionId, gradingResult),
    { name: 'saveGradingResult' }
  );
}

export const gradeSubmissionWorkflow = DBOS.registerWorkflow(gradeSubmissionWorkflowFunction);

