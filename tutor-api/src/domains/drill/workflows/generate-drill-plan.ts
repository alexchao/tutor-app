import { DBOS } from '@dbos-inc/dbos-sdk';
import { generateObject } from 'ai';
import { z } from 'zod';
import { openai } from '../../../lib/openai.js';
import { db } from '../../../db/connection.js';
import { drillSessions, learningTopics } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { interpolatePromptVariables } from '../../../utils/interpolate-prompt-variables.js';
import { processDrillMessageWorkflow } from './process-drill-message.js';

// Drill plan schema for the LLM response
export const drillPlanSchema = z.object({
  phases: z.array(z.object({
    id: z.string(),    // kebab-case slug derived from title
    title: z.string(), // 3-5 words
  })),
});

export type DrillPlan = z.infer<typeof drillPlanSchema>;

// DrillPlan with progress tracking (stored in database)
export interface DrillPlanWithProgress {
  phases: Array<{ id: string; title: string }>;
  planProgress: Record<string, { status: 'incomplete' | 'complete' }>;
}

// Prompt template for generating the drill plan
const drillPlanPromptTemplate = `You are designing a lesson plan for a tutoring drill session. The student will be quizzed about a learning topic through a series of conversational phases.

<topic_content>
{{topicContent}}
</topic_content>

{{focusSection}}

## Instructions

Create a drill plan with 3-6 phases that will guide the tutoring conversation. Each phase should cover a distinct concept or skill from the topic content.

### Phase Guidelines

1. **Coverage**: Ensure the phases collectively cover the key concepts from the topic content
2. **Progression**: Order phases from foundational concepts to more advanced ones
3. **Final Phase**: The last phase MUST be a culminating/application phase that requires the student to apply their knowledge to a specific situation or problem
4. **Distinct Concepts**: Each phase should focus on a different concept - avoid overlap between phases

### Output Format

For each phase, provide:
- **id**: A unique kebab-case slug derived from the title (e.g., "understanding-core-concepts")
- **title**: A short, descriptive title (3-5 words)

### Example Output

{
  "phases": [
    { "id": "defining-key-terms", "title": "Defining Key Terms" },
    { "id": "understanding-relationships", "title": "Understanding Relationships" },
    { "id": "applying-to-scenarios", "title": "Applying to Scenarios" }
  ]
}`;

const focusSectionTemplate = `## Focus Area

The student wants to focus specifically on: {{focusSelectionValue}}

Ensure the phases are tailored to this focus area while still providing comprehensive coverage.`;

interface GenerateDrillPlanInput {
  sessionId: number;
  userId: string;
}

interface SessionAndTopic {
  session: {
    id: number;
    learningTopicId: number;
    focusSelection: unknown;
  };
  topic: {
    id: number;
    contentMd: string;
    title: string;
  };
}

async function loadSessionAndTopicStep(
  sessionId: number,
  userId: string
): Promise<SessionAndTopic> {
  // Load session
  const [session] = await db
    .select()
    .from(drillSessions)
    .where(eq(drillSessions.id, sessionId))
    .limit(1);

  if (!session) {
    throw new Error(`Drill session ${sessionId} not found`);
  }

  if (session.userId !== userId) {
    throw new Error(`Access denied to drill session ${sessionId}`);
  }

  // Load learning topic
  const [topic] = await db
    .select()
    .from(learningTopics)
    .where(eq(learningTopics.id, session.learningTopicId))
    .limit(1);

  if (!topic) {
    throw new Error(`Learning topic ${session.learningTopicId} not found`);
  }

  return { session, topic };
}

async function generatePlanStep(
  topicContent: string,
  focusSelection: unknown
): Promise<DrillPlan> {
  // Build the focus section if a custom focus was provided
  let focusSection = '';
  if (focusSelection && typeof focusSelection === 'object' && 'focusType' in focusSelection) {
    const fs = focusSelection as { focusType: string; value?: string };
    if (fs.focusType === 'custom' && fs.value) {
      focusSection = interpolatePromptVariables(focusSectionTemplate, {
        focusSelectionValue: fs.value,
      });
    }
  }

  const prompt = interpolatePromptVariables(drillPlanPromptTemplate, {
    topicContent,
    focusSection,
  });

  const { object } = await generateObject({
    model: openai('gpt-4.1-2025-04-14'),
    schema: drillPlanSchema,
    prompt,
  });

  return object;
}

async function storePlanAndUpdateStatusStep(
  sessionId: number,
  drillPlan: DrillPlan
): Promise<void> {
  // Initialize planProgress with all phases set to 'incomplete'
  const planWithProgress: DrillPlanWithProgress = {
    ...drillPlan,
    planProgress: Object.fromEntries(
      drillPlan.phases.map((phase) => [phase.id, { status: 'incomplete' as const }])
    ),
  };

  await db
    .update(drillSessions)
    .set({
      drillPlan: planWithProgress as unknown as Record<string, unknown>,
      status: 'ready',
      updatedAt: new Date(),
    })
    .where(eq(drillSessions.id, sessionId));
}

async function generateDrillPlanWorkflowFunction(
  input: GenerateDrillPlanInput
): Promise<void> {
  const { sessionId, userId } = input;

  // Step 1: Load session and topic
  const { session, topic } = await DBOS.runStep(
    () => loadSessionAndTopicStep(sessionId, userId),
    { name: 'loadSessionAndTopic' }
  );

  // Step 2: Generate the drill plan using LLM
  const drillPlan = await DBOS.runStep(
    () => generatePlanStep(topic.contentMd, session.focusSelection),
    { name: 'generatePlan', retriesAllowed: true, intervalSeconds: 2, maxAttempts: 3 }
  );

  // Step 3: Store the plan and update status to 'ready'
  await DBOS.runStep(
    () => storePlanAndUpdateStatusStep(sessionId, drillPlan),
    { name: 'storePlanAndUpdateStatus' }
  );

  // Step 4: Start the conversation by triggering the chat workflow without a user message
  // This will generate the first assistant message to kick off the drill
  const initialMessageId = crypto.randomUUID();
  
  await DBOS.startWorkflow(processDrillMessageWorkflow)({
    sessionId,
    messageId: initialMessageId,
    userMessage: null, // No user message - AI goes first
    userId,
  });
}

export const generateDrillPlanWorkflow = DBOS.registerWorkflow(generateDrillPlanWorkflowFunction);

