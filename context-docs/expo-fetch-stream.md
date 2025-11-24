# Server-Sent Events (SSE) Streaming in React Native/Expo

A guide to implementing Server-Sent Events (SSE) streaming in React Native applications using Expo.

## Why Manual SSE Parsing?

Unlike web browsers, React Native doesn't have native `EventSource` API support. To consume SSE streams, you need to:

1. Use `expo/fetch` (or a fetch polyfill that supports streaming)
2. Manually parse the SSE stream using ReadableStream
3. Handle chunk buffering since events can be split across multiple network packets

## Step-by-Step Implementation

### Step 1: Import expo/fetch

```typescript
import { fetch } from 'expo/fetch';
```

**Note:** If you're not using Expo, you can use React Native's built-in `fetch`, but `expo/fetch` provides better streaming support across platforms.

### Step 2: Make Request with SSE Headers

```typescript
const response = await fetch('https://api.example.com/stream', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',  // Critical: tells server to send SSE format
  },
  body: JSON.stringify({ your: 'data' }),
});

if (!response.ok) {
  throw new Error(`Request failed: ${response.status}`);
}
```

### Step 3: Get Stream Reader

```typescript
const reader = response.body?.getReader();
const decoder = new TextDecoder();

if (!reader) {
  throw new Error('Streaming not supported or response has no body');
}
```

### Step 4: Read and Parse Stream

```typescript
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  
  if (done) {
    // Stream ended
    break;
  }

  // Decode bytes to text
  buffer += decoder.decode(value, { stream: true });
  
  // SSE events are separated by double newlines (\n\n)
  const events = buffer.split('\n\n');
  
  // Keep the last (potentially incomplete) event in buffer
  buffer = events.pop() || '';

  // Process each complete event
  for (const event of events) {
    if (event.startsWith('data: ')) {
      const data = event.slice(6).trim();  // Remove 'data: ' prefix
      
      // Handle completion signal (optional - depends on your backend)
      // Many backends use '[DONE]' (OpenAI convention) or a JSON completion event
      if (data === '[DONE]') {
        return; // Stream complete
      }
      
      // Parse JSON data
      try {
        const parsed = JSON.parse(data);
        // Handle your event data here
        handleEvent(parsed);
      } catch (e) {
        console.error('Failed to parse SSE event:', e, 'Data:', data);
      }
    }
  }
}
```

## Complete Example: Chat Streaming

```typescript
import { fetch } from 'expo/fetch';
import { useState } from 'react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export function useChatStream() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async (message: string) => {
    setIsLoading(true);

    try {
      const response = await fetch('https://api.example.com/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        throw new Error('Request failed');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('Stream not available');
      }

      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const event of events) {
          if (event.startsWith('data: ')) {
            const data = event.slice(6).trim();
            
            // Handle completion signal (if your backend sends one)
            // This is optional - streams also end when reader.read() returns done: true
            if (data === '[DONE]') {
              setIsLoading(false);
              return;
            }
            
            try {
              const parsed: ChatMessage = JSON.parse(data);
              
              // Update or add message
              setMessages(prev => {
                const existingIndex = prev.findIndex(m => m.id === parsed.id);
                if (existingIndex >= 0) {
                  // Update existing message (for incremental updates)
                  const updated = [...prev];
                  updated[existingIndex] = parsed;
                  return updated;
                } else {
                  // Add new message
                  return [...prev, parsed];
                }
              });
            } catch (e) {
              console.error('Parse error:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Stream error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { messages, sendMessage, isLoading };
}
```

## Key Concepts

### 1. Buffer Management

SSE events can be split across multiple network chunks. Always buffer incomplete data:

```typescript
buffer += decoder.decode(value, { stream: true });
const events = buffer.split('\n\n');
buffer = events.pop() || '';  // Keep incomplete event for next iteration
```

### 2. SSE Format

SSE events follow this format:
```
data: <json-data>\n\n
```

Each event:
- Starts with `data: `
- Contains the actual data (often JSON)
- Ends with `\n\n` (double newline)

### 3. Handling Different Event Types

You can extend the parser to handle different event types:

```typescript
for (const event of events) {
  // Handle data events
  if (event.startsWith('data: ')) {
    const data = event.slice(6).trim();
    handleDataEvent(data);
  }
  
  // Handle event type (if your server sends it)
  if (event.startsWith('event: ')) {
    const eventType = event.slice(7).trim();
    handleEventType(eventType);
  }
  
  // Handle ID (for reconnection)
  if (event.startsWith('id: ')) {
    const id = event.slice(4).trim();
    handleEventId(id);
  }
}
```

### 4. Error Handling

Always wrap streaming logic in try-catch:

```typescript
try {
  // ... streaming code ...
} catch (error) {
  console.error('Stream error:', error);
  // Clean up: cancel reader, reset state, etc.
  reader?.cancel();
  setIsLoading(false);
}
```

### 5. Cleanup

Cancel the reader when component unmounts or user cancels:

```typescript
useEffect(() => {
  return () => {
    reader?.cancel();
  };
}, []);
```

## Common Patterns

### Incremental Message Updates

Many chat APIs send incremental updates to the same message:

```typescript
setMessages(prev => {
  const existingIndex = prev.findIndex(m => m.id === message.id);
  if (existingIndex >= 0) {
    // Update existing message
    const updated = [...prev];
    updated[existingIndex] = message;
    return updated;
  } else {
    // Add new message
    return [...prev, message];
  }
});
```

### Completion Signals

**Note:** The `[DONE]` token is **not** part of the official SSE specification. The official SSE spec doesn't define a standard completion signal - streams simply end when the connection closes (when `reader.read()` returns `done: true`).

However, many backends send a custom completion signal for convenience. The `[DONE]` token is commonly used by OpenAI-compatible APIs and various streaming implementations (see references in [MegaLLM docs](https://docs.megallm.io/docs/openai/streaming), [TokenRouter docs](https://docs.tokenrouter.io/responses-api/streaming), and [GitHub discussions](https://github.com/cline/cline/issues/1786)), but not all backends use it.

Common patterns include:

**Option 1: `[DONE]` token (common in OpenAI-compatible APIs)**
```typescript
if (data === '[DONE]') {
  setIsLoading(false);
  onComplete?.();
  return;
}
```

**Option 2: JSON completion event**
```typescript
const parsed = JSON.parse(data);
if (parsed.type === 'complete' || parsed.event === 'end') {
  setIsLoading(false);
  onComplete?.(parsed);
  return;
}
```

**Option 3: Rely on stream end**
```typescript
// No special handling needed - just check `done` flag
const { done, value } = await reader.read();
if (done) {
  setIsLoading(false);
  onComplete?.();
  break;
}
```

Check your backend's documentation to see which pattern it uses. If your backend doesn't send a completion signal, you can rely on the `done` flag from `reader.read()`.

### Special Event Types

Handle different event types from your backend:

```typescript
const parsed = JSON.parse(data);

if (parsed.type === 'error') {
  throw new Error(parsed.message);
}

if (parsed.type === 'complete') {
  setIsLoading(false);
  onComplete?.(parsed);
  return;
}

// Handle regular data
handleData(parsed);
```

## Troubleshooting

### Stream Not Working

- Ensure `Accept: text/event-stream` header is set
- Verify your backend actually supports SSE streaming
- Check that `response.body` exists and is a ReadableStream

### Incomplete Events

- Make sure you're buffering incomplete chunks correctly
- Verify you're splitting on `\n\n` (double newline), not single `\n`

### Memory Issues

- Cancel readers when done: `reader.cancel()`
- Clear buffers after processing
- Limit buffer size if processing very long streams

## Platform Notes

- **iOS/Android**: Works with `expo/fetch` or React Native's fetch
- **Web**: Can use native `EventSource` API instead, but this approach works too
- **Node.js**: Requires a fetch polyfill like `node-fetch` with streaming support

