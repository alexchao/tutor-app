import { View, StyleSheet, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Text, ActivityIndicator, useTheme, TextInput, IconButton, Card } from 'react-native-paper';
import { trpc } from '@/lib/trpc';
import { useState, useEffect, useRef } from 'react';
import { fetch } from 'expo/fetch';
import { useAuth } from '@clerk/clerk-expo';

interface ChatEvent {
  eventType: 'chat-message';
  id: string;
  eventData: {
    role: 'user' | 'assistant';
    content: string;
  };
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export default function DrillChatScreen() {
  const theme = useTheme();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const sessionIdNum = parseInt(sessionId);
  const { getToken } = useAuth();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingMessages, setPendingMessages] = useState<Map<string, string>>(new Map());
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  
  const sessionQuery = trpc.drill.getSession.useQuery({
    sessionId: sessionIdNum,
  });

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

  // Load messages from session data
  useEffect(() => {
    if (sessionQuery.data?.sessionData) {
      const sessionData = sessionQuery.data.sessionData as { chatEvents?: ChatEvent[] };
      if (sessionData.chatEvents) {
        const loadedMessages = sessionData.chatEvents
          .filter((event) => event.eventType === 'chat-message')
          .map((event) => ({
            id: event.id,
            role: event.eventData.role,
            content: event.eventData.content,
          }));
        setMessages(loadedMessages);
      }
    }
  }, [sessionQuery.data]);

  // Connect to SSE using manual fetch streaming
  useEffect(() => {
    if (!sessionId) return;

    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let isCancelled = false;

    const connectToStream = async () => {
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
          throw new Error(`Stream connection failed: ${response.status}`);
        }

        reader = response.body?.getReader() ?? null;
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error('Stream not available');
        }

        let buffer = '';

        while (!isCancelled) {
          const { done, value } = await reader.read();

          if (done) {
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
                }
              } catch (error) {
                console.error('Error parsing SSE message:', error, 'Data:', data);
              }
            }
          }
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('SSE stream error:', error);
        }
      }
    };

    connectToStream();

    return () => {
      isCancelled = true;
      reader?.cancel();
    };
    // Note: getToken is intentionally not in deps - it's stable and including it causes reconnects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

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
            disabled={sendMessageMutation.isPending || isStreaming}
          />
          <IconButton
            icon="send"
            size={24}
            onPress={handleSendMessage}
            disabled={!inputText.trim() || sendMessageMutation.isPending || isStreaming}
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
});

