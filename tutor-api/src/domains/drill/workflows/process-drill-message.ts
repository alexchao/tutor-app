import { DBOS } from '@dbos-inc/dbos-sdk';
import { stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';
import { anthropic } from '../../../lib/anthropic.js';
import { ablyClient } from '../../../lib/ably.js';
import { db } from '../../../db/connection.js';
import { drillSessions, learningTopics } from '../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import type { DrillPlanWithProgress } from './generate-drill-plan.js';
import { buildDrillSystemPrompt } from '../drill-message-prompts.js';

// Chat event types - polymorphic to support different event kinds
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

interface ProcessDrillMessageInput {
  sessionId: number;
  messageId: string;
  userMessage: string | null; // null when AI goes first (initial message)
  userId: string;
}

async function loadSessionAndTopicStep(
  sessionId: number,
  userId: string
): Promise<{ session: any; topic: any }> {
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

  return { session, topic };
}

async function reloadSessionDataStep(sessionId: number): Promise<SessionData> {
  const [session] = await db
    .select({ sessionData: drillSessions.sessionData })
    .from(drillSessions)
    .where(eq(drillSessions.id, sessionId))
    .limit(1);

  if (!session) {
    throw new Error(`Drill session ${sessionId} not found`);
  }

  return (session.sessionData as SessionData) ?? { chatEvents: [] };
}

async function storeUserMessageStep(
  sessionId: number,
  messageId: string,
  userMessage: string,
  existingSessionData: SessionData | null
): Promise<SessionData> {
  const userChatEvent: ChatEvent = {
    eventType: 'chat-message',
    id: messageId,
    eventData: {
      role: 'user',
      content: userMessage,
    },
  };

  const sessionData: SessionData = existingSessionData ?? { chatEvents: [] };
  sessionData.chatEvents.push(userChatEvent);

  await db
    .update(drillSessions)
    .set({
      sessionData: sessionData as any,
      updatedAt: new Date(),
    })
    .where(eq(drillSessions.id, sessionId));

  return sessionData;
}

async function streamLLMResponseStep(
  sessionId: number,
  assistantMessageId: string,
  sessionData: SessionData,
  topicContent: string,
  focusSelection: any,
  drillPlan: DrillPlanWithProgress
): Promise<string> {
  // Build system prompt
  const systemPrompt = buildDrillSystemPrompt({
    topicContent,
    focusSelection,
    drillPlan,
  });

  // Build messages array from chat events (only chat-message events)
  const messages = sessionData.chatEvents
    .filter((event): event is ChatMessageEvent => event.eventType === 'chat-message')
    .map((event) => ({
      role: event.eventData.role,
      content: event.eventData.content,
    }));

  // Create markPhaseComplete tool with closure over session state
  const markPhaseCompleteTool = tool({
    description: 'Mark a drill phase as complete after you have covered it sufficiently with the user and are ready to move on',
    inputSchema: z.object({
      phaseId: z.string().describe('The ID of the phase to mark as complete'),
    }),
    execute: async ({ phaseId }) => {
      console.log('[Mark Phase Complete]', phaseId);
      // Update planProgress
      drillPlan.planProgress[phaseId] = { status: 'complete' };

      // Add phase-complete event to chat events
      const phaseCompleteEvent: PhaseCompleteEvent = {
        eventType: 'phase-complete',
        id: crypto.randomUUID(),
        eventData: { phaseId },
      };
      sessionData.chatEvents.push(phaseCompleteEvent);

      // Persist both drillPlan and sessionData
      await db
        .update(drillSessions)
        .set({
          drillPlan: drillPlan as unknown as Record<string, unknown>,
          sessionData: sessionData as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(drillSessions.id, sessionId));

      // Publish phase-complete event via Ably for real-time UI updates
      const channel = ablyClient.channels.get(`drill:${sessionId}`);
      await channel.publish('message', {
        type: 'phase-complete',
        phaseId,
      });

      console.log('[Drill Plan Progress]', JSON.stringify(drillPlan.planProgress, null, 2));

      return { success: true, phaseId };
    },
  });
  
  console.log('Calling streamText with system prompt:', systemPrompt);
  
  const model = anthropic('claude-haiku-4-5-20251001')
  // const model = anthropic('claude-sonnet-4-5-20250929');
  
  // 2 steps, to allow the model to mark a phase complete and then send a message
  const stopWhen = stepCountIs(2);

  // Stream LLM response
  // When messages is empty (AI goes first), use prompt instead
  const { textStream } = messages.length > 0
    ? streamText({
        model,
        system: systemPrompt,
        messages: messages as any,
        tools: { markPhaseComplete: markPhaseCompleteTool },
        stopWhen
      })
    : streamText({
        model,
        system: systemPrompt,
        prompt: 'Start the drill with a brief greeting and your first question.',
        tools: { markPhaseComplete: markPhaseCompleteTool },
        stopWhen
      });

  const channel = ablyClient.channels.get(`drill:${sessionId}`);
  let fullResponse = '';

  // Batch deltas to reduce Ably message count (50 msg/sec limit)
  // Accumulate tokens and flush every BATCH_INTERVAL_MS
  const BATCH_INTERVAL_MS = 50;
  let pendingDelta = '';
  let lastFlushTime = Date.now();

  const flushDelta = async () => {
    if (pendingDelta) {
      await channel.publish('message', {
        type: 'delta',
        messageId: assistantMessageId,
        content: pendingDelta,
      });
      pendingDelta = '';
      lastFlushTime = Date.now();
    }
  };

  for await (const textDelta of textStream) {
    fullResponse += textDelta;
    pendingDelta += textDelta;
    
    // Flush if enough time has passed since last flush
    const timeSinceLastFlush = Date.now() - lastFlushTime;
    if (timeSinceLastFlush >= BATCH_INTERVAL_MS) {
      await flushDelta();
    }
  }

  // Flush any remaining content
  await flushDelta();

  // Publish completion event (await this one to ensure delivery)
  await channel.publish('message', {
    type: 'complete',
    messageId: assistantMessageId,
  });

  return fullResponse;
}

async function storeAssistantMessageStep(
  sessionId: number,
  assistantMessageId: string,
  assistantMessage: string,
  sessionData: SessionData
): Promise<void> {
  const assistantChatEvent: ChatEvent = {
    eventType: 'chat-message',
    id: assistantMessageId,
    eventData: {
      role: 'assistant',
      content: assistantMessage,
    },
  };

  sessionData.chatEvents.push(assistantChatEvent);

  await db
    .update(drillSessions)
    .set({
      sessionData: sessionData as any,
      updatedAt: new Date(),
    })
    .where(eq(drillSessions.id, sessionId));
}

async function processDrillMessageWorkflowFunction(
  input: ProcessDrillMessageInput
): Promise<void> {
  const { sessionId, messageId, userMessage, userId } = input;

  // Generate assistant message ID
  const assistantMessageId = crypto.randomUUID();

  // Step 1: Load session and topic
  const { session, topic } = await DBOS.runStep(
    () => loadSessionAndTopicStep(sessionId, userId),
    { name: 'loadSessionAndTopic' }
  );

  // Step 2: Store user message (skip if AI goes first)
  let sessionData: SessionData;
  if (userMessage !== null) {
    sessionData = await DBOS.runStep(
      () => storeUserMessageStep(sessionId, messageId, userMessage, session.sessionData),
      { name: 'storeUserMessage' }
    );
  } else {
    // AI goes first - use existing session data or initialize empty
    sessionData = (session.sessionData as SessionData) ?? { chatEvents: [] };
  }

  // Get drill plan from session
  const drillPlan = session.drillPlan as DrillPlanWithProgress;

  // Step 3: Stream LLM response
  const assistantMessage = await DBOS.runStep(
    () =>
      streamLLMResponseStep(
        sessionId,
        assistantMessageId,
        sessionData,
        topic.contentMd,
        session.focusSelection,
        drillPlan
      ),
    { name: 'streamLLMResponse', retriesAllowed: true, intervalSeconds: 2, maxAttempts: 3 }
  );

  // Step 4: Reload session data to ensure we have latest state (including any phase completions from tool calls)
  const latestSessionData = await DBOS.runStep(
    () => reloadSessionDataStep(sessionId),
    { name: 'reloadSessionData' }
  );

  // Step 5: Store assistant message
  await DBOS.runStep(
    () => storeAssistantMessageStep(sessionId, assistantMessageId, assistantMessage, latestSessionData),
    { name: 'storeAssistantMessage' }
  );
}

export const processDrillMessageWorkflow = DBOS.registerWorkflow(
  processDrillMessageWorkflowFunction
);

