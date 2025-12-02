import { View, StyleSheet, ScrollView } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Text, Button, TextInput, ActivityIndicator, useTheme, Card } from 'react-native-paper';
import { trpc } from '@/lib/trpc';
import { useState } from 'react';

// Type for completion data from previous sessions
interface CompletionData {
  phasesRatings: Array<{ phaseId: string; rating: string }>;
  nextFocusAreas: string[];
}

// Helper to format relative date
function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const timeStr = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  if (diffDays === 0) {
    return `Today at ${timeStr}`;
  } else if (diffDays === 1) {
    return `Yesterday at ${timeStr}`;
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
}

export default function DrillFocusSelectionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { topicId } = useLocalSearchParams<{ topicId: string }>();
  const [customFocus, setCustomFocus] = useState('');
  const topicIdNum = parseInt(topicId);

  const topicQuery = trpc.learningTopics.list.useQuery();
  const topic = topicQuery.data?.find((t) => t.id.toString() === topicId);

  const recentSessionsQuery = trpc.drill.getRecentCompletedSessions.useQuery(
    { learningTopicId: topicIdNum },
    { enabled: !isNaN(topicIdNum) }
  );

  const createSessionMutation = trpc.drill.createSession.useMutation({
    onSuccess: (data) => {
      router.push(`/practice/drill/chat/${data.sessionId}`);
    },
  });

  const handleEverything = () => {
    createSessionMutation.mutate({
      learningTopicId: topicIdNum,
      focusSelection: null,
    });
  };

  const handleCustomFocus = () => {
    if (customFocus.trim()) {
      createSessionMutation.mutate({
        learningTopicId: topicIdNum,
        focusSelection: {
          focusType: 'custom',
          value: customFocus.trim(),
        },
      });
    }
  };

  const handlePreviousFocusAreas = (sessionId: number, focusAreas: string[]) => {
    createSessionMutation.mutate({
      learningTopicId: topicIdNum,
      focusSelection: {
        focusType: 'previous-focus-areas',
        sourceSessionId: sessionId,
        focusAreas,
      },
    });
  };

  if (topicQuery.isLoading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!topic) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <Text>Topic not found</Text>
      </View>
    );
  }

  const recentSessions = recentSessionsQuery.data ?? [];
  const hasRecentSessions = recentSessions.length > 0;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Drill Focus',
          headerBackTitle: 'Back',
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.onBackground,
        }}
      />
      <ScrollView
        style={[styles.scrollView, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.scrollContent}
      >
        <Text variant="headlineSmall" style={styles.heading}>
          What do you want to focus on?
        </Text>

        <Button
          mode="contained"
          onPress={handleEverything}
          disabled={createSessionMutation.isPending}
          style={styles.everythingButton}
          contentStyle={styles.buttonContent}
        >
          Everything
        </Button>

        {/* Previous Drills Section */}
        {hasRecentSessions && (
          <>
            <Text variant="titleMedium" style={styles.orText}>
              or
            </Text>
            <Text
              variant="titleMedium"
              style={[styles.sectionTitle, { color: theme.colors.onSurfaceVariant }]}
            >
              Previous Drills
            </Text>
            {recentSessions.map((session) => {
              const completionData = session.completionData as CompletionData | null;
              const focusAreas = completionData?.nextFocusAreas ?? [];
              const completedAt = session.chatCompletedAt
                ? new Date(session.chatCompletedAt)
                : null;

              return (
                <Card
                  key={session.id}
                  style={[styles.sessionCard, { backgroundColor: '#FFFFFF' }]}
                >
                  <Card.Content style={styles.sessionCardContent}>
                    <View style={styles.sessionRow}>
                      <View style={styles.sessionContent}>
                        <View style={styles.sessionHeader}>
                          <Text
                            variant="labelMedium"
                            style={{ color: theme.colors.onSurfaceVariant }}
                          >
                            {completedAt ? formatRelativeDate(completedAt) : 'Completed'}
                          </Text>
                        </View>
                        <Text
                          variant="labelSmall"
                          style={[styles.focusAreasLabel, { color: theme.colors.onSurfaceVariant }]}
                        >
                          Next Focus Areas
                        </Text>
                        <View style={styles.focusAreasContainer}>
                          {focusAreas.map((area, index) => (
                            <View key={index} style={styles.focusAreaRow}>
                              <Text style={[styles.bullet, { color: theme.colors.onSurface }]}>•</Text>
                              <Text
                                variant="bodyMedium"
                                style={[styles.focusAreaText, { color: theme.colors.onSurface }]}
                              >
                                {area}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                      <Button
                        mode="contained-tonal"
                        compact
                        onPress={() => handlePreviousFocusAreas(session.id, focusAreas)}
                        disabled={createSessionMutation.isPending || focusAreas.length === 0}
                        style={styles.startButton}
                      >
                        Start
                      </Button>
                    </View>
                  </Card.Content>
                </Card>
              );
            })}
          </>
        )}

        <Text variant="titleMedium" style={styles.orText}>
          or
        </Text>

        <TextInput
          label="Custom Focus"
          value={customFocus}
          onChangeText={setCustomFocus}
          mode="outlined"
          placeholder="e.g., specific concepts or topics"
          style={styles.textInput}
          disabled={createSessionMutation.isPending}
        />

        <Button
          mode="contained"
          onPress={handleCustomFocus}
          disabled={createSessionMutation.isPending || !customFocus.trim()}
          style={styles.submitButton}
          contentStyle={styles.buttonContent}
        >
          Start Drill
        </Button>

        {createSessionMutation.isPending && (
          <ActivityIndicator size="large" style={styles.loader} />
        )}

        {createSessionMutation.isError && (
          <Text variant="bodyMedium" style={styles.errorText}>
            Error: {createSessionMutation.error.message}
          </Text>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  container: {
    flex: 1,
    padding: 20,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  heading: {
    marginBottom: 32,
  },
  everythingButton: {
    marginBottom: 24,
  },
  buttonContent: {
    paddingVertical: 8,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  sessionCard: {
    marginBottom: 12,
    borderRadius: 12,
  },
  sessionCardContent: {
    paddingVertical: 12,
  },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  sessionContent: {
    flex: 1,
    marginRight: 12,
  },
  sessionHeader: {
    marginBottom: 4,
  },
  focusAreasLabel: {
    marginBottom: 8,
    fontWeight: '600',
  },
  focusAreasContainer: {
    gap: 4,
  },
  focusAreaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  bullet: {
    marginRight: 8,
    fontSize: 16,
    lineHeight: 20,
  },
  focusAreaText: {
    flex: 1,
  },
  startButton: {
    paddingHorizontal: 8,
    alignSelf: 'flex-start',
  },
  orText: {
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  textInput: {
    marginBottom: 16,
  },
  submitButton: {
    marginBottom: 16,
  },
  loader: {
    marginTop: 16,
  },
  errorText: {
    color: 'red',
    marginTop: 16,
    textAlign: 'center',
  },
});
