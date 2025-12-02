import { DBOS } from '@dbos-inc/dbos-sdk';
import { generateObject } from 'ai';
import { z } from 'zod';
import { anthropic } from '../../../lib/anthropic.js';
import { db } from '../../../db/connection.js';
import { drillSessions, learningTopics } from '../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { interpolatePromptVariables } from '../../../utils/interpolate-prompt-variables.js';
import type { DrillPlanWithProgress } from './generate-drill-plan.js';

// Schema for the completion data
export const completionDataSchema = z.object({
  phasesRatings: z.array(
    z.object({
      phaseId: z.string(),
      rating: z.enum(['strong', 'so-so', 'weak', 'incomplete']),
    })
  ),
  nextFocusAreas: z.array(z.string()).length(3),
});

export type CompletionData = z.infer<typeof completionDataSchema>;

// Chat event types (duplicated from process-drill-message.ts for type safety)
type ChatMessageEvent = {
  eventType: 'chat-message';
  id: string;
  eventData: {
    role: 'user' | 'assistant';
    content: string;
  };
};

type PhaseCompleteEvent = {
  eventType: 'phase-complete';
  id: string;
  eventData: {
    phaseId: string;
  };
};

type ChatEvent = ChatMessageEvent | PhaseCompleteEvent;

interface SessionData {
  chatEvents: ChatEvent[];
}

// Prompt template for summarizing the drill session
const summarizePromptTemplate = `You are evaluating a tutoring drill session. The student was quizzed about a learning topic through a series of conversational phases.

<topic_content>
{{topicContent}}
</topic_content>

<drill_phases>
{{drillPhasesDescription}}
</drill_phases>

<conversation_history>
{{conversationHistory}}
</conversation_history>

## Instructions

Evaluate the student's performance in this drill session and provide:

1. **Phase Ratings**: For each phase in the drill plan, rate the student's understanding:
   - **strong**: Student demonstrated solid understanding, answered correctly with minimal help
   - **so-so**: Student showed partial understanding, needed some hints or made minor errors
   - **weak**: Student struggled significantly, needed substantial help or made major errors
   - **incomplete**: This phase was not covered or barely touched during the session

2. **Next Focus Areas**: Identify 2-3 concept areas the student should focus on next. These should be:
   - Specific concepts from the topic content where the student showed weakness
   - Concise names (3-6 words each)
   - Actionable areas for future study

Base your evaluation strictly on the conversation history provided.`;

interface SummarizeDrillSessionInput {
  sessionId: number;
  userId: string;
}

interface SessionAndTopic {
  session: {
    id: number;
    sessionData: SessionData | null;
    drillPlan: DrillPlanWithProgress | null;
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
    .where(and(eq(drillSessions.id, sessionId), eq(drillSessions.userId, userId)))
    .limit(1);

  if (!session) {
    throw new Error(`Drill session ${sessionId} not found or access denied`);
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

  return {
    session: {
      id: session.id,
      sessionData: session.sessionData as SessionData | null,
      drillPlan: session.drillPlan as DrillPlanWithProgress | null,
    },
    topic,
  };
}

function buildConversationHistory(sessionData: SessionData | null): string {
  if (!sessionData?.chatEvents) {
    return '(No conversation recorded)';
  }

  return sessionData.chatEvents
    .filter((event): event is ChatMessageEvent => event.eventType === 'chat-message')
    .map((event) => {
      const role = event.eventData.role === 'user' ? 'Student' : 'Tutor';
      return `${role}: ${event.eventData.content}`;
    })
    .join('\n\n');
}

function buildDrillPhasesDescription(drillPlan: DrillPlanWithProgress | null): string {
  if (!drillPlan?.phases) {
    return '(No drill plan)';
  }

  return drillPlan.phases
    .map((phase, index) => {
      const status = drillPlan.planProgress[phase.id]?.status ?? 'incomplete';
      return `${index + 1}. ${phase.title} (id: ${phase.id}, status: ${status})`;
    })
    .join('\n');
}

async function generateSummaryStep(
  topicContent: string,
  sessionData: SessionData | null,
  drillPlan: DrillPlanWithProgress | null
): Promise<CompletionData> {
  const conversationHistory = buildConversationHistory(sessionData);
  const drillPhasesDescription = buildDrillPhasesDescription(drillPlan);

  const prompt = interpolatePromptVariables(summarizePromptTemplate, {
    topicContent,
    conversationHistory,
    drillPhasesDescription,
  });

  const { object } = await generateObject({
    model: anthropic('claude-3-5-haiku-20241022'),
    schema: completionDataSchema,
    prompt,
  });

  return object;
}

async function storeCompletionDataStep(
  sessionId: number,
  completionData: CompletionData
): Promise<void> {
  await db
    .update(drillSessions)
    .set({
      completionData: completionData as unknown as Record<string, unknown>,
      status: 'completed',
      updatedAt: new Date(),
    })
    .where(eq(drillSessions.id, sessionId));
}

async function summarizeDrillSessionWorkflowFunction(
  input: SummarizeDrillSessionInput
): Promise<void> {
  const { sessionId, userId } = input;

  // Step 1: Load session and topic
  const { session, topic } = await DBOS.runStep(
    () => loadSessionAndTopicStep(sessionId, userId),
    { name: 'loadSessionAndTopic' }
  );

  // Step 2: Generate summary using LLM
  const completionData = await DBOS.runStep(
    () => generateSummaryStep(topic.contentMd, session.sessionData, session.drillPlan),
    { name: 'generateSummary', retriesAllowed: true, intervalSeconds: 2, maxAttempts: 3 }
  );

  // Step 3: Store completion data and update status
  await DBOS.runStep(
    () => storeCompletionDataStep(sessionId, completionData),
    { name: 'storeCompletionData' }
  );
}

export const summarizeDrillSessionWorkflow = DBOS.registerWorkflow(
  summarizeDrillSessionWorkflowFunction
);

