import { View, StyleSheet, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Text, ActivityIndicator, useTheme, TextInput, IconButton, Card, Button } from 'react-native-paper';
import { trpc } from '@/lib/trpc';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { DrillProgressBar } from '@/components/drill-progress-bar';
import { useDrillSSE } from '@/hooks/use-drill-sse';

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

export default function DrillChatScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const sessionIdNum = parseInt(sessionId);
  const { getToken } = useAuth();
  
  // Store all chat events (messages and phase completions) for inline rendering
  const [chatEvents, setChatEvents] = useState<ChatEvent[]>([]);
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [completedPhaseIds, setCompletedPhaseIds] = useState<Set<string>>(new Set());
  const [recentlyCompletedPhaseId, setRecentlyCompletedPhaseId] = useState<string | null>(null);
  const [showFinishButton, setShowFinishButton] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // SSE connection management via custom hook
  const { pendingMessages, isReconnecting, connectionError, handleManualRetry } = useDrillSSE({
    sessionId,
    getToken,
    onMessageComplete: (messageId, content) => {
      const newEvent: ChatMessageEvent = {
        eventType: 'chat-message',
        id: messageId,
        eventData: { role: 'assistant', content },
      };
      setChatEvents((prev) => [...prev, newEvent]);
      setIsStreaming(false);
    },
    onPhaseComplete: (phaseId) => {
      // Add phase-complete event to chat events for inline display
      const newEvent: PhaseCompleteEvent = {
        eventType: 'phase-complete',
        id: `phase-complete-${phaseId}-${Date.now()}`,
        eventData: { phaseId },
      };
      setChatEvents((prev) => [...prev, newEvent]);
      // Also update progress bar state
      setCompletedPhaseIds((prev) => new Set([...prev, phaseId]));
      setRecentlyCompletedPhaseId(phaseId);
    },
  });
  
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
      // Add user message event
      const newEvent: ChatMessageEvent = {
        eventType: 'chat-message',
        id: data.messageId,
        eventData: { role: 'user', content: variables.message },
      };
      setChatEvents((prev) => [...prev, newEvent]);
      
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

  // Load all chat events and drill plan progress from session data
  useEffect(() => {
    if (sessionQuery.data?.sessionData) {
      const sessionData = sessionQuery.data.sessionData as { chatEvents?: ChatEvent[] };
      if (sessionData.chatEvents) {
        // Load all events (messages and phase-complete indicators)
        setChatEvents(sessionData.chatEvents);
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

  // Auto-scroll when chat events update
  useEffect(() => {
    if (chatEvents.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [chatEvents]);

  // Callback to clear the recently completed phase after animation
  const handlePhaseAnimationComplete = useCallback(() => {
    setRecentlyCompletedPhaseId(null);
  }, []);

  // Handle finish button press
  const handleFinishPress = useCallback(() => {
    if (!sessionIdNum || isNaN(sessionIdNum)) {
      console.error('[DrillChat] Invalid sessionId:', sessionId);
      return;
    }
    finishSessionMutation.mutate({ sessionId: sessionIdNum });
  }, [finishSessionMutation, sessionIdNum, sessionId]);

  // Toggle finish button visibility
  const handleProgressBarPress = useCallback(() => {
    setShowFinishButton((prev) => !prev);
  }, []);

  // Extract drill plan for progress bar
  const drillPlan = sessionQuery.data?.drillPlan as DrillPlan | undefined;

  // Check if all phases are complete
  const allPhasesComplete = drillPlan?.phases
    ? drillPlan.phases.length > 0 && completedPhaseIds.size === drillPlan.phases.length
    : false;

  // Auto-show finish button when all phases are complete
  useEffect(() => {
    if (allPhasesComplete) {
      setShowFinishButton(true);
    }
  }, [allPhasesComplete]);

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

  const pendingEntries = Array.from(pendingMessages.entries());

  // Helper to get phase title from drill plan
  const getPhaseTitle = (phaseId: string): string => {
    if (!drillPlan?.phases) return phaseId;
    const phase = drillPlan.phases.find((p) => p.id === phaseId);
    return phase?.title ?? phaseId;
  };
  
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
          <>
            <DrillProgressBar
              phases={drillPlan.phases}
              completedPhaseIds={completedPhaseIds}
              recentlyCompletedPhaseId={recentlyCompletedPhaseId}
              onAnimationComplete={handlePhaseAnimationComplete}
              allPhasesComplete={allPhasesComplete}
              onPress={handleProgressBarPress}
            />
            {showFinishButton && (
              <View style={[styles.finishButtonContainer, { backgroundColor: theme.colors.surface }]}>
                <Button
                  mode={allPhasesComplete ? 'contained' : 'outlined'}
                  onPress={handleFinishPress}
                  style={styles.finishButton}
                  loading={finishSessionMutation.isPending}
                  disabled={finishSessionMutation.isPending}
                >
                  {allPhasesComplete ? 'Finish' : 'Leave'}
                </Button>
                {finishSessionMutation.isError && (
                  <Text variant="bodySmall" style={[styles.errorText, { color: theme.colors.error }]}>
                    Failed to finish session. Please try again.
                  </Text>
                )}
              </View>
            )}
          </>
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
          data={chatEvents}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          renderItem={({ item }) => {
            // Render phase-complete indicator
            if (item.eventType === 'phase-complete') {
              const phaseTitle = getPhaseTitle(item.eventData.phaseId);
              return (
                <View style={styles.phaseCompleteContainer}>
                  <IconButton
                    icon="check-circle"
                    size={16}
                    iconColor={theme.colors.primary}
                    style={styles.phaseCompleteIcon}
                  />
                  <Text
                    variant="labelSmall"
                    style={[styles.phaseCompleteText, { color: theme.colors.onSurfaceVariant }]}
                  >
                    {phaseTitle}
                  </Text>
                </View>
              );
            }

            // Render chat message
            const role = item.eventData.role;
            return (
              <View
                style={[
                  styles.messageContainer,
                  role === 'user' ? styles.userMessage : styles.assistantMessage,
                ]}
              >
                <Card
                  style={[
                    styles.messageCard,
                    role === 'user'
                      ? { backgroundColor: theme.colors.primaryContainer }
                      : { backgroundColor: theme.colors.surfaceVariant },
                  ]}
                >
                  <Card.Content>
                    <Text
                      variant="bodyMedium"
                      style={
                        role === 'user'
                          ? { color: theme.colors.onPrimaryContainer }
                          : { color: theme.colors.onSurfaceVariant }
                      }
                    >
                      {item.eventData.content}
                    </Text>
                  </Card.Content>
                </Card>
              </View>
            );
          }}
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
            maxLength={3000}
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
  phaseCompleteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginBottom: 12,
  },
  phaseCompleteIcon: {
    margin: 0,
    marginRight: 4,
  },
  phaseCompleteText: {
    fontStyle: 'italic',
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
  finishButtonContainer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  finishButton: {
    alignSelf: 'center',
  },
});
