import { View, StyleSheet, FlatList, KeyboardAvoidingView, Platform, AppState, AppStateStatus } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Text, ActivityIndicator, useTheme, TextInput, IconButton, Card } from 'react-native-paper';
import { trpc } from '@/lib/trpc';
import { useState, useEffect, useRef, useCallback } from 'react';
import { fetch } from 'expo/fetch';
import { useAuth } from '@clerk/clerk-expo';
import { DrillProgressBar } from '@/components/drill-progress-bar';

interface ChatMessageEvent {
  eventType: 'chat-message';
  id: string;
  eventData: {
    role: 'user' | 'assistant';
    content: string;
  };
}

interface PhaseCompleteEvent {
  eventType: 'phase-complete';
  id: string;
  eventData: {
    phaseId: string;
  };
}

type ChatEvent = ChatMessageEvent | PhaseCompleteEvent;

interface DrillPlan {
  phases: Array<{ id: string; title: string }>;
  planProgress: Record<string, { status: 'incomplete' | 'complete' }>;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

// Retry configuration constants
const MAX_RETRY_ATTEMPTS = 10;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 30000; // 30 seconds

export default function DrillChatScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const sessionIdNum = parseInt(sessionId);
  const { getToken } = useAuth();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingMessages, setPendingMessages] = useState<Map<string, string>>(new Map());
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [completedPhaseIds, setCompletedPhaseIds] = useState<Set<string>>(new Set());
  const [recentlyCompletedPhaseId, setRecentlyCompletedPhaseId] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [reconnectTrigger, setReconnectTrigger] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const retryCountRef = useRef<number>(0);
  const retryTimeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isManualRetryRef = useRef<boolean>(false);
  const connectionRef = useRef<{ reader: ReadableStreamDefaultReader<Uint8Array> | null; isCancelled: boolean } | null>(null);
  const reconnectOnForegroundRef = useRef<boolean>(false);
  
  const sessionQuery = trpc.drill.getSession.useQuery(
    { sessionId: sessionIdNum },
    {
      // Poll every 1 second while status is 'preparing'
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        return status === 'preparing' ? 1000 : false;
      },
    }
  );

  const isPreparing = sessionQuery.data?.status === 'preparing';

  const sendMessageMutation = trpc.drill.sendMessage.useMutation({
    onSuccess: (data, variables) => {
      // Add user message with the ID from backend
      setMessages((prev) => [
        ...prev,
        {
          id: data.messageId,
          role: 'user',
          content: variables.message,
        },
      ]);
      
      // Note: The assistant response will come through SSE, not returned here
      setIsStreaming(true);
    },
    onError: (error) => {
      console.error('[DrillChat] Error sending message:', error);
    },
  });

  const finishSessionMutation = trpc.drill.finishSession.useMutation({
    onSuccess: () => {
      router.replace(`/practice/drill/results/${sessionId}`);
    },
    onError: (error) => {
      console.error('[DrillChat] Error finishing session:', error);
    },
  });

  // Load messages and drill plan progress from session data
  useEffect(() => {
    if (sessionQuery.data?.sessionData) {
      const sessionData = sessionQuery.data.sessionData as { chatEvents?: ChatEvent[] };
      if (sessionData.chatEvents) {
        const loadedMessages = sessionData.chatEvents
          .filter((event): event is ChatMessageEvent => event.eventType === 'chat-message')
          .map((event) => ({
            id: event.id,
            role: event.eventData.role,
            content: event.eventData.content,
          }));
        setMessages(loadedMessages);
      }
    }

    // Initialize completed phase IDs from drill plan
    if (sessionQuery.data?.drillPlan) {
      const drillPlan = sessionQuery.data.drillPlan as DrillPlan;
      const completed = new Set<string>();
      for (const [phaseId, progress] of Object.entries(drillPlan.planProgress)) {
        if (progress.status === 'complete') {
          completed.add(phaseId);
        }
      }
      setCompletedPhaseIds(completed);
    }
  }, [sessionQuery.data]);

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
            setConnectionError(`Connection failed: ${response.status === 401 || response.status === 403 ? 'Authentication error' : `Error ${response.status}`}`);
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

                      // Add to messages
                      setMessages((prevMessages) => [
                        ...prevMessages,
                        {
                          id: parsed.messageId,
                          role: 'assistant',
                          content,
                        },
                      ]);

                      newMap.delete(parsed.messageId);
                      setIsStreaming(false);
                      return newMap;
                    });
                  } else if (parsed.type === 'phase-complete') {
                    // Update completed phases and trigger animation
                    const phaseId = parsed.phaseId as string;
                    setCompletedPhaseIds((prev) => new Set([...prev, phaseId]));
                    setRecentlyCompletedPhaseId(phaseId);
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
            const isBackgroundError = errorMessage.includes('network connection was lost') || 
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
          const isBackgroundError = errorMessage.includes('network connection was lost') || 
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

  const handleSendMessage = () => {
    if (!inputText.trim() || sendMessageMutation.isPending) return;

    const messageText = inputText.trim();
    
    sendMessageMutation.mutate({
      sessionId: sessionIdNum,
      message: messageText,
    });

    setInputText('');
    
    // Scroll to bottom
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  // Auto-scroll when messages update
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  // Callback to clear the recently completed phase after animation
  const handlePhaseAnimationComplete = useCallback(() => {
    setRecentlyCompletedPhaseId(null);
  }, []);

  // Handle finish button press
  const handleFinishPress = useCallback(() => {
    finishSessionMutation.mutate({ sessionId: sessionIdNum });
  }, [finishSessionMutation, sessionIdNum]);

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

  // Extract drill plan for progress bar
  const drillPlan = sessionQuery.data?.drillPlan as DrillPlan | undefined;

  // Check if all phases are complete
  const allPhasesComplete = drillPlan?.phases
    ? drillPlan.phases.length > 0 && completedPhaseIds.size === drillPlan.phases.length
    : false;

  if (sessionQuery.isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (sessionQuery.isError) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Text variant="bodyLarge" style={styles.errorText}>
          Error loading session: {sessionQuery.error.message}
        </Text>
      </View>
    );
  }

  // Show preparing state while drill plan is being generated
  if (isPreparing) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Drill Session',
            headerBackTitle: 'Back',
            headerStyle: { backgroundColor: theme.colors.background },
            headerTintColor: theme.colors.onBackground,
          }}
        />
        <View style={[styles.container, styles.preparingContainer, { backgroundColor: theme.colors.background }]}>
          <ActivityIndicator size="large" style={styles.preparingSpinner} />
          <Text variant="titleMedium" style={{ color: theme.colors.onBackground }}>
            Preparing your drill session...
          </Text>
        </View>
      </>
    );
  }

  const allMessages = [...messages];
  const pendingEntries = Array.from(pendingMessages.entries());
  
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Drill Session',
          headerBackTitle: 'Back',
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.onBackground,
        }}
      />
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={100}
      >
        {drillPlan && drillPlan.phases && (
          <DrillProgressBar
            phases={drillPlan.phases}
            completedPhaseIds={completedPhaseIds}
            recentlyCompletedPhaseId={recentlyCompletedPhaseId}
            onAnimationComplete={handlePhaseAnimationComplete}
            allPhasesComplete={allPhasesComplete}
            onFinishPress={handleFinishPress}
          />
        )}
        {(isReconnecting || connectionError) && (
          <View style={[styles.connectionStatusContainer, { backgroundColor: theme.colors.surfaceVariant }]}>
            {isReconnecting ? (
              <View style={styles.connectionStatusRow}>
                <ActivityIndicator size="small" style={styles.connectionStatusSpinner} />
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Reconnecting...
                </Text>
              </View>
            ) : connectionError ? (
              <View style={styles.connectionStatusRow}>
                <Text variant="bodySmall" style={{ color: theme.colors.error, flex: 1 }}>
                  {connectionError}
                </Text>
                <IconButton
                  icon="refresh"
                  size={20}
                  onPress={handleManualRetry}
                  iconColor={theme.colors.error}
                />
              </View>
            ) : null}
          </View>
        )}
        <FlatList
          ref={flatListRef}
          data={allMessages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          renderItem={({ item }) => (
            <View
              style={[
                styles.messageContainer,
                item.role === 'user' ? styles.userMessage : styles.assistantMessage,
              ]}
            >
              <Card
                style={[
                  styles.messageCard,
                  item.role === 'user'
                    ? { backgroundColor: theme.colors.primaryContainer }
                    : { backgroundColor: theme.colors.surfaceVariant },
                ]}
              >
                <Card.Content>
                  <Text
                    variant="bodyMedium"
                    style={
                      item.role === 'user'
                        ? { color: theme.colors.onPrimaryContainer }
                        : { color: theme.colors.onSurfaceVariant }
                    }
                  >
                    {item.content}
                  </Text>
                </Card.Content>
              </Card>
            </View>
          )}
          ListFooterComponent={
            <>
              {pendingEntries.map(([id, content]) => (
                <View key={id} style={[styles.messageContainer, styles.assistantMessage]}>
                  <Card
                    style={[
                      styles.messageCard,
                      { backgroundColor: theme.colors.surfaceVariant },
                    ]}
                  >
                    <Card.Content>
                      <Text
                        variant="bodyMedium"
                        style={{ color: theme.colors.onSurfaceVariant }}
                      >
                        {content || '...'}
                      </Text>
                    </Card.Content>
                  </Card>
                </View>
              ))}
              {isStreaming && (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" />
                </View>
              )}
            </>
          }
        />

        <View style={[styles.inputContainer, { backgroundColor: theme.colors.surface }]}>
          <TextInput
            value={inputText}
            onChangeText={setInputText}
            placeholder="Type your answer..."
            mode="outlined"
            style={styles.textInput}
            multiline
            maxLength={500}
            disabled={sendMessageMutation.isPending || isStreaming || !!connectionError}
          />
          <IconButton
            icon="send"
            size={24}
            onPress={handleSendMessage}
            disabled={!inputText.trim() || sendMessageMutation.isPending || isStreaming || !!connectionError}
          />
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  preparingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  preparingSpinner: {
    marginBottom: 16,
  },
  messageList: {
    padding: 16,
  },
  messageContainer: {
    marginBottom: 12,
    maxWidth: '80%',
  },
  userMessage: {
    alignSelf: 'flex-end',
  },
  assistantMessage: {
    alignSelf: 'flex-start',
  },
  messageCard: {
    borderRadius: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 8,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  textInput: {
    flex: 1,
    marginRight: 8,
    maxHeight: 100,
  },
  errorText: {
    textAlign: 'center',
    color: 'red',
  },
  loadingContainer: {
    padding: 16,
    alignItems: 'center',
  },
  connectionStatusContainer: {
    padding: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  connectionStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  connectionStatusSpinner: {
    marginRight: 8,
  },
});

