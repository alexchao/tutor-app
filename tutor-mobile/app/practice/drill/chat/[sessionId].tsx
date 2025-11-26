import { View, StyleSheet, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Text, ActivityIndicator, useTheme, TextInput, IconButton, Card } from 'react-native-paper';
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

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export default function DrillChatScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const sessionIdNum = parseInt(sessionId);
  const { getToken } = useAuth();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [completedPhaseIds, setCompletedPhaseIds] = useState<Set<string>>(new Set());
  const [recentlyCompletedPhaseId, setRecentlyCompletedPhaseId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  // SSE connection management via custom hook
  const { pendingMessages, isReconnecting, connectionError, handleManualRetry } = useDrillSSE({
    sessionId,
    getToken,
    onMessageComplete: (messageId, content) => {
      setMessages((prev) => [...prev, { id: messageId, role: 'assistant', content }]);
      setIsStreaming(false);
    },
    onPhaseComplete: (phaseId) => {
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
