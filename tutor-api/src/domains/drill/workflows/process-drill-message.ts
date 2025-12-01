import { DBOS } from '@dbos-inc/dbos-sdk';
import { stepCountIs, streamText, tool, type ModelMessage } from 'ai';
import { z } from 'zod';
import { anthropic } from '../../../lib/anthropic.js';
import { ablyClient } from '../../../lib/ably.js';
import { db } from '../../../db/connection.js';
import { drillSessions, learningTopics } from '../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import type { DrillPlanWithProgress } from './generate-drill-plan.js';
import { buildDrillSystemPrompt } from '../drill-message-prompts.js';

const TARGET_NUM_TURNS = 10;

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
  aiSdkMessages: ModelMessage[];
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

  return (session.sessionData as SessionData) ?? { chatEvents: [], aiSdkMessages: [] };
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

  const sessionData: SessionData = existingSessionData ?? { chatEvents: [], aiSdkMessages: [] };
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

interface AssistantMessage {
  id: string;
  content: string;
}

interface StreamLLMResponseResult {
  assistantMessages: AssistantMessage[];
  responseMessages: ModelMessage[];
}

async function streamLLMResponseStep(
  sessionId: number,
  initialMessageId: string,
  sessionData: SessionData,
  topicContent: string,
  focusSelection: any,
  drillPlan: DrillPlanWithProgress,
  userMessage: string | null
): Promise<StreamLLMResponseResult> {
  // Count turns by counting user messages in chatEvents
  const numTurns = sessionData.chatEvents.filter(
    (event) => event.eventType === 'chat-message' && event.eventData.role === 'user'
  ).length;

  // Build system prompt
  const systemPrompt = buildDrillSystemPrompt({
    topicContent,
    focusSelection,
    drillPlan,
    numTurns,
    targetNumTurns: TARGET_NUM_TURNS,
  });

  // Build input messages from stored AI SDK messages (includes tool calls)
  const inputMessages: ModelMessage[] = [...sessionData.aiSdkMessages];

  // Add the current user message if present
  if (userMessage !== null) {
    inputMessages.push({ role: 'user', content: userMessage });
  }

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
  // When inputMessages is empty (AI goes first), use prompt instead
  const { fullStream, response } = inputMessages.length > 0
    ? streamText({
        model,
        system: systemPrompt,
        messages: inputMessages,
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
  
  // Track multiple messages - each tool call splits into a new message
  const assistantMessages: AssistantMessage[] = [];
  let currentMessageId = initialMessageId;
  let accumulatedText = '';

  // Batch deltas to reduce Ably message count (50 msg/sec limit)
  const BATCH_INTERVAL_MS = 200;
  let pendingDelta = '';
  let lastFlushTime = Date.now();

  const flushDelta = async (): Promise<void> => {
    if (pendingDelta) {
      await channel.publish('message', {
        type: 'delta',
        messageId: currentMessageId,
        content: pendingDelta,
      });
      pendingDelta = '';
      lastFlushTime = Date.now();
    }
  };

  // Finalize current message and prepare for next one
  const finalizeCurrentMessage = async (): Promise<void> => {
    // Flush any pending delta first
    await flushDelta();
    
    // Only finalize if there's accumulated text
    if (accumulatedText.trim()) {
      // Publish completion event for this message
      await channel.publish('message', {
        type: 'complete',
        messageId: currentMessageId,
      });
      
      // Store this message
      assistantMessages.push({
        id: currentMessageId,
        content: accumulatedText,
      });
      
      // Generate new message ID for next segment
      currentMessageId = crypto.randomUUID();
      accumulatedText = '';
    }
  };

  for await (const chunk of fullStream) {
    if (chunk.type === 'text-delta') {
      accumulatedText += chunk.text;
      pendingDelta += chunk.text;
      
      // Flush if enough time has passed since last flush
      const timeSinceLastFlush = Date.now() - lastFlushTime;
      if (timeSinceLastFlush >= BATCH_INTERVAL_MS) {
        await flushDelta();
      }
    } else if (chunk.type === 'tool-call') {
      // Tool call detected - finalize current message before tool executes
      // This splits the response into separate messages around tool calls
      await finalizeCurrentMessage();
      
      console.log('[Tool Call]', chunk.toolName, chunk.input);
    }
    // Other chunk types (tool-result, finish, etc.) are handled automatically
  }

  // Finalize any remaining accumulated text as the last message
  await flushDelta();
  if (accumulatedText.trim()) {
    await channel.publish('message', {
      type: 'complete',
      messageId: currentMessageId,
    });
    
    assistantMessages.push({
      id: currentMessageId,
      content: accumulatedText,
    });
  }

  // Await the response to get the AI SDK messages (includes tool calls)
  const finalResponse = await response;

  return {
    assistantMessages,
    responseMessages: finalResponse.messages,
  };
}

async function storeAssistantMessagesStep(
  sessionId: number,
  assistantMessages: AssistantMessage[],
  sessionData: SessionData,
  responseMessages: ModelMessage[],
  userMessage: string | null
): Promise<void> {
  // Add each assistant message as a chat event
  for (const message of assistantMessages) {
    const assistantChatEvent: ChatEvent = {
      eventType: 'chat-message',
      id: message.id,
      eventData: {
        role: 'assistant',
        content: message.content,
      },
    };
    sessionData.chatEvents.push(assistantChatEvent);
  }

  // Add user message to AI SDK messages first (if present)
  // response.messages only contains the new assistant/tool messages, not the input
  if (userMessage !== null) {
    sessionData.aiSdkMessages.push({ role: 'user', content: userMessage });
  }

  // Append AI SDK response messages (includes tool calls and results)
  sessionData.aiSdkMessages.push(...responseMessages);

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

  // Generate initial assistant message ID (may be split into multiple if tool calls occur)
  const initialMessageId = crypto.randomUUID();

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
    sessionData = (session.sessionData as SessionData) ?? { chatEvents: [], aiSdkMessages: [] };
  }

  // Get drill plan from session
  const drillPlan = session.drillPlan as DrillPlanWithProgress;

  // Step 3: Stream LLM response (may produce multiple assistant messages if tool calls occur)
  const { assistantMessages, responseMessages } = await DBOS.runStep(
    () =>
      streamLLMResponseStep(
        sessionId,
        initialMessageId,
        sessionData,
        topic.contentMd,
        session.focusSelection,
        drillPlan,
        userMessage
      ),
    { name: 'streamLLMResponse', retriesAllowed: true, intervalSeconds: 2, maxAttempts: 3 }
  );

  // Step 4: Reload session data to ensure we have latest state (including any phase completions from tool calls)
  const latestSessionData = await DBOS.runStep(
    () => reloadSessionDataStep(sessionId),
    { name: 'reloadSessionData' }
  );

  // Step 5: Store assistant messages and AI SDK response messages
  await DBOS.runStep(
    () => storeAssistantMessagesStep(sessionId, assistantMessages, latestSessionData, responseMessages, userMessage),
    { name: 'storeAssistantMessages' }
  );
}

export const processDrillMessageWorkflow = DBOS.registerWorkflow(
  processDrillMessageWorkflowFunction
);

