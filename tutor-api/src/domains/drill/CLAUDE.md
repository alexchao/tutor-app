# Drill Practice Mode

The Drill practice mode is an interactive chat-based quiz where an AI tutor quizzes users about their learning topics using Socratic questioning.

## Overview

- **Purpose**: Quiz users one question at a time about their learning material
- **Interface**: Real-time chat with streaming AI responses
- **Focus**: Users can drill on "Everything" or specify a custom focus area

## Architecture

```
┌─────────────────┐     tRPC      ┌─────────────────┐     DBOS      ┌─────────────────┐
│   Mobile App    │──────────────▶│   Drill Router  │──────────────▶│    Workflow     │
│                 │               │                 │               │                 │
│  - Focus UI     │               │  - createSession│               │  - Store msg    │
│  - Chat UI      │               │  - getSession   │               │  - Stream LLM   │
│                 │               │  - sendMessage  │               │  - Store reply  │
└────────┬────────┘               └─────────────────┘               └────────┬────────┘
         │                                                                   │
         │ SSE                                                         Ably  │
         │                                                                   │
         │                        ┌─────────────────┐                        │
         └───────────────────────▶│   SSE Endpoint  │◀───────────────────────┘
                                  │ /api/drill/     │
                                  │ stream/:sessionId│
                                  └─────────────────┘
```

### Data Flow

1. User creates a drill session with optional focus selection
2. Backend starts `generateDrillPlanWorkflow` (fire-and-forget)
3. Workflow generates drill plan using LLM, stores it, updates status to 'ready'
4. Workflow triggers `processDrillMessageWorkflow` with no user message (AI goes first)
5. Initial AI message streams via Ably, stored in session data
6. User sends subsequent messages via `drill.sendMessage` tRPC mutation
7. LLM deltas are published to Ably channel `drill:{sessionId}`
8. SSE endpoint subscribes to Ably and forwards events to connected client

## Database Schema

### `drillSessions` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | serial | Primary key |
| `learningTopicId` | integer | FK to learning_topics |
| `userId` | text | Clerk user ID (owner) |
| `focusSelection` | jsonb | Focus config (see below) |
| `sessionData` | jsonb | Chat history (see below) |
| `status` | text | Session status: `'preparing'` or `'ready'` |
| `drillPlan` | jsonb | Generated drill plan (see below) |
| `createdAt` | timestamp | Auto-set |
| `updatedAt` | timestamp | Auto-updated |

### Focus Selection Schema

```typescript
// null = "Everything" (no specific focus)
// object = custom focus
type FocusSelection = null | {
  focusType: 'custom';
  value: string; // User-provided focus area
};
```

### Session Data Schema

```typescript
interface SessionData {
  chatEvents: ChatEvent[];
}

interface ChatEvent {
  eventType: 'chat-message';
  id: string;  // UUID
  eventData: {
    role: 'user' | 'assistant';
    content: string;
  };
}
```

The `chatEvents` array is polymorphic - designed to support future event types beyond `chat-message`.

### Drill Plan Schema

```typescript
interface DrillPlan {
  phases: Array<{
    id: string;    // kebab-case slug (e.g., "understanding-core-concepts")
    title: string; // 3-5 word title
  }>;
}
```

The drill plan is generated when a session is created and contains 3-6 phases:
- Each phase covers a distinct concept from the topic content
- Phases progress from foundational to advanced
- The final phase is always a culminating/application phase
- Phases are tailored to the user's focus selection (if provided)

## tRPC Endpoints

All endpoints require authentication (`protectedProcedure`).

### `drill.createSession`

Creates a new drill session and starts drill plan generation.

**Input:**
```typescript
{
  learningTopicId: number;
  focusSelection?: { focusType: 'custom'; value: string } | null;
}
```

**Output:**
```typescript
{ sessionId: number }
```

**Behavior:**
- Creates session with `status: 'preparing'`
- Starts `generateDrillPlanWorkflow` in background (fire-and-forget)
- Returns immediately with `sessionId`
- Client should poll `getSession` until `status === 'ready'`

### `drill.getSession`

Retrieves a drill session with all chat history.

**Input:**
```typescript
{ sessionId: number }
```

**Output:** Full `DrillSession` record including `sessionData`.

### `drill.sendMessage`

Sends a user message and triggers the AI response workflow.

**Input:**
```typescript
{
  sessionId: number;
  message: string;
}
```

**Output:**
```typescript
{ messageId: string }  // UUID for the user message
```

**Behavior:**
- Validates user owns the session
- Generates UUID for the user message
- Starts `processDrillMessageWorkflow` in background (fire-and-forget)
- Returns immediately with `messageId`

## SSE Endpoint

**Route:** `GET /api/drill/stream/:sessionId`

**Authentication:** Requires Clerk `Authorization: Bearer <token>` header

**Purpose:** Real-time streaming of LLM response deltas to the client

**Event Format:**
```typescript
// Delta event (partial response)
{ type: 'delta'; messageId: string; content: string }

// Completion event
{ type: 'complete'; messageId: string }
```

**Implementation:**
- Validates user owns the session
- Subscribes to Ably channel `drill:{sessionId}`
- Forwards Ably messages as SSE events
- Sends heartbeat every 30 seconds
- Cleans up Ably subscription on disconnect

## Workflow: `generateDrillPlanWorkflow`

**Location:** `workflows/generate-drill-plan.ts`

**Input:**
```typescript
{
  sessionId: number;
  userId: string;
}
```

### Workflow Steps

1. **loadSessionAndTopic** - Load session and associated learning topic
2. **generatePlan** - Call `generateObject` to create drill plan (with retries)
3. **storePlanAndUpdateStatus** - Store plan in DB, set status to `'ready'`
4. **Start conversation** - Trigger `processDrillMessageWorkflow` with `userMessage: null`

### LLM Plan Generation

- **Model:** `gpt-4.1-2025-04-14`
- **Method:** Vercel AI SDK `generateObject` with Zod schema
- **Output:** 3-6 phases with `id` (kebab-case slug) and `title` (3-5 words)

---

## Workflow: `processDrillMessageWorkflow`

**Location:** `workflows/process-drill-message.ts`

**Input:**
```typescript
{
  sessionId: number;
  messageId: string;      // Message UUID
  userMessage: string | null;  // null when AI goes first
  userId: string;
}
```

### Workflow Steps

1. **loadSessionAndTopic** - Load session and associated learning topic
2. **storeUserMessage** - Append user message to `sessionData.chatEvents` (skipped if `userMessage` is null)
3. **streamLLMResponse** - Stream LLM completion via Ably (with retries)
4. **storeAssistantMessage** - Append assistant response to `sessionData.chatEvents`

### LLM Streaming

- **Model:** `gpt-5.1-2025-11-13`
- **Streaming:** Uses Vercel AI SDK `streamText`
- **Batching:** Accumulates tokens and flushes every 50ms to stay under Ably's 50 msg/sec limit

### Ably Channel

- **Channel name:** `drill:{sessionId}`
- **Event name:** `message`
- **Message types:** `delta` (streaming content) and `complete` (end of response)

## System Prompts

Two prompt templates are used based on focus selection:

### Base Template (No Focus)

Used when `focusSelection` is null ("Everything"):

- Instructs AI to quiz about the full topic content
- One question at a time
- Short, conversational messages
- Probing questions, not filling in details
- Grounded in topic content only

### Focus Template

Used when `focusSelection.focusType === 'custom'`:

- Same base guidelines
- Additional constraint to only ask about the specified focus area

### Guidelines Enforced

- **Single question per turn** - No multiple questions
- **Question clarity** - Clear about expected detail level
- **Probing approach** - Don't assume student knowledge
- **Question-oriented** - Only reveal answers if student is stuck
- **Off-topic handling** - Refuse and redirect
- **Tone** - Measured, not overly critical or encouraging
- **Length** - 1-2 short sentences max
- **No markdown** - Plain text only

## File Structure

```
domains/drill/
├── CLAUDE.md                          # This documentation
└── workflows/
    ├── index.ts                       # Exports all drill workflows
    ├── generate-drill-plan.ts         # Drill plan generation workflow
    └── process-drill-message.ts       # Main chat workflow
```

Related files outside this domain:
- `routers/drill.ts` - tRPC router
- `routes/drill-sse.ts` - SSE endpoint
- `lib/ably.ts` - Ably client setup

## Error Handling

- **Session not found:** TRPCError with `NOT_FOUND` code
- **Access denied:** Session ownership validated against `userId`
- **LLM failures:** Workflow step retries (3 attempts, 2 second intervals)
- **Ably rate limits:** Batching prevents exceeding 50 msg/sec

## Future Considerations

- Integration of drill plan phases into chat prompts (phase-aware questioning)
- Additional `ChatEvent` types (e.g., `system-message`, `hint-request`)
- Session completion/scoring
- Multiple focus areas per session
- Conversation branching/threading

