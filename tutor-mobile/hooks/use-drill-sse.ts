import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { fetch } from 'expo/fetch';

// Retry configuration constants
const MAX_RETRY_ATTEMPTS = 10;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 30000; // 30 seconds

export interface UseDrillSSEOptions {
  sessionId: string | null;
  getToken: () => Promise<string | null>;
  onMessageComplete: (messageId: string, content: string) => void;
  onPhaseComplete: (phaseId: string) => void;
}

export interface UseDrillSSEReturn {
  pendingMessages: Map<string, string>;
  isReconnecting: boolean;
  connectionError: string | null;
  handleManualRetry: () => void;
}

/**
 * Hook to manage SSE connection for drill chat sessions.
 * Handles connection lifecycle, reconnection with exponential backoff,
 * and AppState changes (background/foreground).
 */
export function useDrillSSE({
  sessionId,
  getToken,
  onMessageComplete,
  onPhaseComplete,
}: UseDrillSSEOptions): UseDrillSSEReturn {
  const [pendingMessages, setPendingMessages] = useState<Map<string, string>>(new Map());
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [reconnectTrigger, setReconnectTrigger] = useState(0);

  const retryCountRef = useRef<number>(0);
  const retryTimeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isManualRetryRef = useRef<boolean>(false);
  const connectionRef = useRef<{
    reader: ReadableStreamDefaultReader<Uint8Array> | null;
    isCancelled: boolean;
  } | null>(null);
  const reconnectOnForegroundRef = useRef<boolean>(false);

  // Store callbacks in refs to avoid effect re-runs
  const onMessageCompleteRef = useRef(onMessageComplete);
  const onPhaseCompleteRef = useRef(onPhaseComplete);

  useEffect(() => {
    onMessageCompleteRef.current = onMessageComplete;
  }, [onMessageComplete]);

  useEffect(() => {
    onPhaseCompleteRef.current = onPhaseComplete;
  }, [onPhaseComplete]);

  // Helper function to check if an error is retryable
  const isRetryableError = (error: unknown, statusCode?: number): boolean => {
    // Non-retryable errors: auth failures, not found, bad request
    if (statusCode && (statusCode === 401 || statusCode === 403 || statusCode === 404 || statusCode === 400)) {
      return false;
    }

    // Network errors and connection issues are retryable
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('network') ||
        message.includes('connection') ||
        message.includes('fetch') ||
        message.includes('timeout')
      );
    }

    // Default to retryable for unknown errors
    return true;
  };

  // Calculate exponential backoff delay
  const calculateRetryDelay = (attemptNumber: number): number => {
    const delay = Math.min(
      INITIAL_RETRY_DELAY * Math.pow(2, attemptNumber - 1),
      MAX_RETRY_DELAY
    );
    return delay;
  };

  // Handle app state changes (background/foreground)
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        // App going to background - gracefully close connection
        if (connectionRef.current && !connectionRef.current.isCancelled) {
          connectionRef.current.isCancelled = true;
          connectionRef.current.reader?.cancel().catch(() => {
            // Ignore errors during cancel
          });
          connectionRef.current.reader = null;
          reconnectOnForegroundRef.current = true;

          // Clear any pending retry timeouts
          if (retryTimeoutIdRef.current) {
            clearTimeout(retryTimeoutIdRef.current);
            retryTimeoutIdRef.current = null;
          }
        }
      } else if (nextAppState === 'active') {
        // App coming to foreground - reconnect if needed
        if (reconnectOnForegroundRef.current && sessionId) {
          reconnectOnForegroundRef.current = false;
          retryCountRef.current = 0;
          isManualRetryRef.current = true;
          setConnectionError(null);
          setIsReconnecting(true);
          setReconnectTrigger((prev) => prev + 1);
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [sessionId]);

  // Connect to SSE using manual fetch streaming with reconnection
  useEffect(() => {
    if (!sessionId) return;

    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let isCancelled = false;
    let streamClosedNormally = false;

    // Store connection in ref for AppState handler
    connectionRef.current = { reader, isCancelled };

    const attemptReconnect = () => {
      if (isCancelled) return;

      const currentRetryCount = retryCountRef.current;

      if (currentRetryCount >= MAX_RETRY_ATTEMPTS) {
        setConnectionError('Connection lost. Please refresh the page to reconnect.');
        setIsReconnecting(false);
        reconnectOnForegroundRef.current = false;
        return;
      }

      const delay = calculateRetryDelay(currentRetryCount + 1);
      setIsReconnecting(true);

      retryTimeoutIdRef.current = setTimeout(() => {
        if (!isCancelled && connectionRef.current) {
          retryCountRef.current = currentRetryCount + 1;
          connectToStream();
        }
      }, delay);
    };

    const connectToStream = async () => {
      // Don't connect if already cancelled (e.g., app in background)
      if (isCancelled || !connectionRef.current) return;

      // Check if this is a manual retry
      const isManualRetry = isManualRetryRef.current;
      if (isManualRetry) {
        // Reset the flag for this connection attempt
        isManualRetryRef.current = false;
        retryCountRef.current = 0;
        setConnectionError(null);
        setIsReconnecting(false);
      }
      try {
        const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
        const token = await getToken();

        const response = await fetch(`${apiUrl}/api/drill/stream/${sessionId}`, {
          method: 'GET',
          headers: {
            'Accept': 'text/event-stream',
            'Authorization': token ? `Bearer ${token}` : '',
          },
        });

        if (!response.ok) {
          const isRetryable = isRetryableError(
            new Error(`Stream connection failed: ${response.status}`),
            response.status
          );

          if (isRetryable && !isCancelled && connectionRef.current) {
            attemptReconnect();
          } else {
            setConnectionError(
              `Connection failed: ${
                response.status === 401 || response.status === 403
                  ? 'Authentication error'
                  : `Error ${response.status}`
              }`
            );
            setIsReconnecting(false);
            reconnectOnForegroundRef.current = false;
          }
          return;
        }

        reader = response.body?.getReader() ?? null;
        const decoder = new TextDecoder();

        if (!reader) {
          if (!isCancelled && connectionRef.current) {
            attemptReconnect();
          }
          return;
        }

        // Update connection ref
        if (connectionRef.current) {
          connectionRef.current.reader = reader;
          connectionRef.current.isCancelled = isCancelled;
        }

        // Reset retry count on successful connection
        retryCountRef.current = 0;
        setIsReconnecting(false);
        setConnectionError(null);
        reconnectOnForegroundRef.current = false;
        streamClosedNormally = false;

        let buffer = '';

        while (!isCancelled && connectionRef.current) {
          try {
            const { done, value } = await reader.read();

            if (done) {
              streamClosedNormally = true;
              break;
            }

            // Decode bytes to text
            buffer += decoder.decode(value, { stream: true });

            // SSE events are separated by double newlines
            const events = buffer.split('\n\n');

            // Keep the last (potentially incomplete) event in buffer
            buffer = events.pop() || '';

            // Process each complete event
            for (const event of events) {
              if (event.startsWith('data: ')) {
                const data = event.slice(6).trim();

                // Skip heartbeat messages
                if (!data) continue;

                try {
                  const parsed = JSON.parse(data);

                  if (parsed.type === 'delta') {
                    setPendingMessages((prev) => {
                      const newMap = new Map(prev);
                      const current = newMap.get(parsed.messageId) || '';
                      newMap.set(parsed.messageId, current + parsed.content);
                      return newMap;
                    });
                  } else if (parsed.type === 'complete') {
                    setPendingMessages((prev) => {
                      const newMap = new Map(prev);
                      const content = newMap.get(parsed.messageId) || '';

                      // Call the callback to add the message
                      onMessageCompleteRef.current(parsed.messageId, content);

                      newMap.delete(parsed.messageId);
                      return newMap;
                    });
                  } else if (parsed.type === 'phase-complete') {
                    // Call the callback to update completed phases
                    const phaseId = parsed.phaseId as string;
                    onPhaseCompleteRef.current(phaseId);
                  }
                } catch (error) {
                  console.error('Error parsing SSE message:', error, 'Data:', data);
                }
              }
            }
          } catch (readError) {
            // Reader.read() can throw on network errors
            // Check if error is due to app being in background
            const errorMessage = readError instanceof Error ? readError.message.toLowerCase() : '';
            const isBackgroundError =
              errorMessage.includes('network connection was lost') ||
              errorMessage.includes('connection was lost');

            if (!isCancelled && connectionRef.current) {
              // Only log and reconnect if not a background error
              // Background errors are handled by AppState handler
              if (!isBackgroundError) {
                console.error('Error reading from stream:', readError);
                streamClosedNormally = false;
                attemptReconnect();
              }
            }
            break;
          }
        }

        // If stream closed unexpectedly (not normally), attempt to reconnect
        // But only if not cancelled (which would indicate app went to background)
        if (!streamClosedNormally && !isCancelled && connectionRef.current && !reconnectOnForegroundRef.current) {
          attemptReconnect();
        }
      } catch (error) {
        if (!isCancelled && connectionRef.current) {
          const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
          const isBackgroundError =
            errorMessage.includes('network connection was lost') ||
            errorMessage.includes('connection was lost');

          // Only handle non-background errors here
          if (!isBackgroundError) {
            console.error('SSE stream error:', error);

            const isRetryable = isRetryableError(error);
            if (isRetryable) {
              attemptReconnect();
            } else {
              setConnectionError('Connection failed. Please refresh the page.');
              setIsReconnecting(false);
              reconnectOnForegroundRef.current = false;
            }
          }
        }
      }
    };

    // Start connection
    connectToStream();

    return () => {
      isCancelled = true;
      streamClosedNormally = true; // Treat cleanup as normal closure

      // Update connection ref
      if (connectionRef.current) {
        connectionRef.current.isCancelled = true;
        connectionRef.current.reader?.cancel().catch(() => {
          // Ignore errors during cleanup
        });
        connectionRef.current.reader = null;
      }

      reader?.cancel().catch(() => {
        // Ignore errors during cleanup
      });

      if (retryTimeoutIdRef.current) {
        clearTimeout(retryTimeoutIdRef.current);
        retryTimeoutIdRef.current = null;
      }
      retryCountRef.current = 0;
      isManualRetryRef.current = false;
      reconnectOnForegroundRef.current = false;
      setIsReconnecting(false);
    };
    // Note: getToken is intentionally not in deps - it's stable and including it causes reconnects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, reconnectTrigger]);

  // Handle manual retry when connection fails
  const handleManualRetry = useCallback(() => {
    // Clear any pending retry timeouts
    if (retryTimeoutIdRef.current) {
      clearTimeout(retryTimeoutIdRef.current);
      retryTimeoutIdRef.current = null;
    }
    // Reset retry count and mark as manual retry
    retryCountRef.current = 0;
    isManualRetryRef.current = true;
    setConnectionError(null);
    setIsReconnecting(true);
    // Trigger reconnection by incrementing reconnectTrigger
    setReconnectTrigger((prev) => prev + 1);
  }, []);

  return {
    pendingMessages,
    isReconnecting,
    connectionError,
    handleManualRetry,
  };
}

