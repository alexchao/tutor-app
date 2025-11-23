import { DBOS } from "@dbos-inc/dbos-sdk";
import { streamObject } from 'ai';
import { openai } from './lib/openai.js';
import { z } from 'zod';
import { db } from './db/connection.js';
import { practiceQuestionSubmissions, learningTopics } from './db/schema.js';
import { eq } from 'drizzle-orm';

async function stepOne(): Promise<void> {
  DBOS.logger.info("Step one: Hello from DBOS!");
}

async function stepTwo(): Promise<void> {
  DBOS.logger.info("Step two: Workflow executing...");
}

async function greetingWorkflowFunction(): Promise<string> {
  await DBOS.runStep(() => stepOne(), { name: "stepOne" });
  await DBOS.runStep(() => stepTwo(), { name: "stepTwo" });
  return "Greeting workflow completed successfully!";
}

export const greetingWorkflow = DBOS.registerWorkflow(greetingWorkflowFunction);

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
  const { partialObjectStream } = streamObject({
    model: openai('gpt-5.1-2025-11-13'),
    schema: gradingResultSchema,
    prompt: `You are grading a student's response to a practice question about a learning topic.

<topic_title>
${topicTitle}
</topic_title>

<source_material>
${topicContent}
</source_material>

<question_prompt>
${questionPrompt}
</question_prompt>

<student_response>
${studentResponse}
</student_response>

Based on the source material, identify 3-7 concrete criteria that the response should have covered. The number of criteria should be proportional to the scope and length of the source material.

For each criterion, evaluate whether it was:
- SATISFIED: The student clearly addressed this criterion
- PARTIALLY_SATISFIED: The student mentioned it but incompletely or with errors
- NOT_SATISFIED: The student did not address this criterion

Return a JSON object with an array of criteria, each containing:
- title: A concise name for the criterion
- result: SATISFIED | PARTIALLY_SATISFIED | NOT_SATISFIED
- feedbackMd: Specific feedback with **markdown formatting** explaining why this result was given`,
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

