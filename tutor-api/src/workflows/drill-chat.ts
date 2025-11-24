import { DBOS } from '@dbos-inc/dbos-sdk';
import { streamText } from 'ai';
import { openai } from '../lib/openai.js';
import { ablyClient } from '../lib/ably.js';
import { db } from '../db/connection.js';
import { drillSessions, learningTopics } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

interface ChatEvent {
  eventType: 'chat-message';
  id: string;
  eventData: {
    role: 'user' | 'assistant';
    content: string;
  };
}

interface SessionData {
  chatEvents: ChatEvent[];
}

interface ProcessDrillMessageInput {
  sessionId: number;
  messageId: string;
  userMessage: string;
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
  focusSelection: any
): Promise<string> {
  // Build system prompt
  let systemPrompt = `You are a helpful tutor quizzing a student about the following topic:

<topic_content>
${topicContent}
</topic_content>`;

  if (focusSelection && focusSelection.focusType === 'custom') {
    systemPrompt += `\n\nThe student wants to focus specifically on: ${focusSelection.value}`;
  }

  systemPrompt += `\n\nQuiz the student one question at a time. Keep your messages very short and conversational. Use Socratic questioning to help them learn.`;

  // Build messages array from chat events
  const messages = sessionData.chatEvents
    .filter((event) => event.eventType === 'chat-message')
    .map((event) => ({
      role: event.eventData.role,
      content: event.eventData.content,
    }));

  // Stream LLM response
  const { textStream } = streamText({
    model: openai('gpt-5.1-2025-11-13'),
    system: systemPrompt,
    messages: messages as any,
  });

  const channel = ablyClient.channels.get(`drill:${sessionId}`);
  let fullResponse = '';

  for await (const textDelta of textStream) {
    fullResponse += textDelta;
    
    // Publish delta to Ably
    await channel.publish('message', {
      type: 'delta',
      messageId: assistantMessageId,
      content: textDelta,
    });
  }

  // Publish completion event
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

  // Step 2: Store user message
  const sessionData = await DBOS.runStep(
    () => storeUserMessageStep(sessionId, messageId, userMessage, session.sessionData),
    { name: 'storeUserMessage' }
  );

  // Step 3: Stream LLM response
  const assistantMessage = await DBOS.runStep(
    () =>
      streamLLMResponseStep(
        sessionId,
        assistantMessageId,
        sessionData,
        topic.contentMd,
        session.focusSelection
      ),
    { name: 'streamLLMResponse', retriesAllowed: true, intervalSeconds: 2, maxAttempts: 3 }
  );

  // Step 4: Store assistant message
  await DBOS.runStep(
    () => storeAssistantMessageStep(sessionId, assistantMessageId, assistantMessage, sessionData),
    { name: 'storeAssistantMessage' }
  );
}

export const processDrillMessageWorkflow = DBOS.registerWorkflow(
  processDrillMessageWorkflowFunction
);

