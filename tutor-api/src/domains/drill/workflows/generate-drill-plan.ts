import { DBOS } from '@dbos-inc/dbos-sdk';
import { generateObject } from 'ai';
import { z } from 'zod';
import { anthropic } from '../../../lib/anthropic.js';
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

Create a drill plan with 3-4 phases that will guide the tutoring conversation.

{{phaseGuidelines}}

### Output Format

For each phase, provide:
- **id**: A unique kebab-case slug derived from the title (e.g., "light-dependent-reactions")
- **title**: A short, descriptive title (3-5 words)

### Example Output

{
  "phases": [
    { "id": "role-of-chlorophyll", "title": "Role of Chlorophyll" },
    { "id": "steps-light-reactions", "title": "Steps in Light Reactions" },
    { "id": "outputs-photosynthesis", "title": "Outputs of Photosynthesis" },
  ]
}`;

const focusSectionTemplate = `## Focus Area

The student wants to focus specifically on: {{focusSelectionValue}}

Ensure the phases are tailored to this focus area while still providing comprehensive coverage.`;

const previousFocusAreasSectionTemplate = `## Focus Areas from Previous Drill

The student wants to focus on these specific areas identified from a previous drill session:

<focus_areas>
{{focusAreas}}
</focus_areas>

Create drill phases that directly address each of these focus areas. Each phase should target one or more of these specific concepts.`;

// Phase guidelines for "everything" focus (null focusSelection)
const everythingPhaseGuidelines = `### Phase Guidelines

1. **Coverage**: Ensure the phases collectively cover the key concepts from the topic content
2. **Progression**: Order phases from foundational concepts to more advanced ones
3. **Final Phase**: The last phase MUST be a culminating/application phase that requires the student to apply their knowledge to a specific situation or problem
4. **Distinct Concepts**: Each phase should focus on a different concept - avoid overlap between phases
5. **Specific Concepts**: Each phase should focus on a narrow, specific concept - avoid broad or general phrasing`;

// Phase guidelines for "custom" focus
const customFocusPhaseGuidelines = `### Phase Guidelines

1. **Focus Alignment**: All phases must directly relate to the student's specified focus area
2. **Different Aspects**: Each phase should cover a different aspect or angle of the focus area
3. **Final Phase**: The last phase MUST be a culminating/application phase that requires the student to apply their knowledge to a specific situation or problem
4. **Distinct Concepts**: Each phase should focus on a different concept - avoid overlap between phases
5. **Specific Concepts**: Each phase should focus on a narrow, specific concept - avoid broad or general phrasing`;

// Phase guidelines for "previous-focus-areas" focus
const previousFocusAreasPhaseGuidelines = `### Phase Guidelines

1. **Address Focus Areas**: Each phase should target one or more of the provided focus areas
2. **Complete Coverage**: Ensure all provided focus areas are addressed across the phases
3. **Final Phase**: The last phase MUST be a culminating/application phase that requires the student to apply their knowledge to a specific situation or problem
4. **Distinct Concepts**: Each phase should focus on a different concept - avoid overlap between phases
5. **Specific Concepts**: Each phase should focus on a narrow, specific concept - avoid broad or general phrasing`;

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
  // Build the focus section and select phase guidelines based on focus type
  let focusSection = '';
  let phaseGuidelines = everythingPhaseGuidelines;

  if (focusSelection && typeof focusSelection === 'object' && 'focusType' in focusSelection) {
    const fs = focusSelection as { focusType: string; value?: string; focusAreas?: string[] };
    if (fs.focusType === 'custom' && fs.value) {
      focusSection = interpolatePromptVariables(focusSectionTemplate, {
        focusSelectionValue: fs.value,
      });
      phaseGuidelines = customFocusPhaseGuidelines;
    } else if (fs.focusType === 'previous-focus-areas' && fs.focusAreas && fs.focusAreas.length > 0) {
      focusSection = interpolatePromptVariables(previousFocusAreasSectionTemplate, {
        focusAreas: fs.focusAreas.map((area, i) => `${i + 1}. ${area}`).join('\n'),
      });
      phaseGuidelines = previousFocusAreasPhaseGuidelines;
    }
  }

  const prompt = interpolatePromptVariables(drillPlanPromptTemplate, {
    topicContent,
    focusSection,
    phaseGuidelines,
  });
  
  console.log('Generated drill plan prompt:', prompt);

  const { object } = await generateObject({
    model: anthropic('claude-sonnet-4-5-20250929'),
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

