import { View, StyleSheet, ScrollView } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Text, Button, useTheme, ActivityIndicator, Card, Chip } from 'react-native-paper';
import { trpc } from '../../../../lib/trpc';
import { useEffect } from 'react';

// Types for completion data
interface PhaseRating {
  phaseId: string;
  rating: 'strong' | 'so-so' | 'weak' | 'incomplete';
}

interface CompletionData {
  phasesRatings: PhaseRating[];
  nextFocusAreas: string[];
}

interface DrillPlan {
  phases: Array<{ id: string; title: string }>;
  planProgress: Record<string, { status: 'incomplete' | 'complete' }>;
}

// Rating display configuration
const ratingConfig: Record<PhaseRating['rating'], { label: string; color: string; icon: string }> = {
  strong: { label: 'Strong', color: '#4CAF50', icon: '✓' },
  'so-so': { label: 'So-so', color: '#FF9800', icon: '~' },
  weak: { label: 'Weak', color: '#f44336', icon: '✗' },
  incomplete: { label: 'Incomplete', color: '#9E9E9E', icon: '○' },
};

export default function DrillResultsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const sessionIdNum = sessionId ? parseInt(sessionId, 10) : NaN;

  // Poll for session results until completionData is available
  const {
    data: sessionResults,
    isLoading,
    error,
    refetch,
  } = trpc.drill.getSessionResults.useQuery(
    { sessionId: sessionIdNum },
    {
      enabled: !isNaN(sessionIdNum),
      refetchInterval: (query) => {
        // Stop polling once we have completion data
        if (query.state.data?.completionData) {
          return false;
        }
        return 2000; // Poll every 2 seconds
      },
    }
  );

  const completionData = sessionResults?.completionData as CompletionData | null;
  const drillPlan = sessionResults?.drillPlan as DrillPlan | null;

  // Refetch on mount in case data is stale
  useEffect(() => {
    refetch();
  }, [refetch]);

  const handleGoToTopics = () => {
    router.replace('/(tabs)/topics');
  };

  // Get phase title by ID
  const getPhaseTitleById = (phaseId: string): string => {
    const phase = drillPlan?.phases.find((p) => p.id === phaseId);
    return phase?.title ?? phaseId;
  };

  // Loading state
  if (isLoading || !completionData) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Drill Results',
            headerBackVisible: false,
            headerStyle: { backgroundColor: theme.colors.background },
            headerTintColor: theme.colors.onBackground,
          }}
        />
        <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text
            variant="bodyLarge"
            style={[styles.loadingText, { color: theme.colors.onSurfaceVariant }]}
          >
            Analyzing your session...
          </Text>
        </View>
      </>
    );
  }

  // Error state
  if (error) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Drill Results',
            headerBackVisible: false,
            headerStyle: { backgroundColor: theme.colors.background },
            headerTintColor: theme.colors.onBackground,
          }}
        />
        <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
          <Text variant="bodyLarge" style={{ color: theme.colors.error }}>
            Error loading results
          </Text>
          <Button mode="contained" onPress={() => refetch()} style={styles.retryButton}>
            Retry
          </Button>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Drill Results',
          headerBackVisible: false,
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.onBackground,
        }}
      />
      <ScrollView
        style={[styles.scrollView, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.scrollContent}
      >
        <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.onBackground }]}>
          Drill Complete!
        </Text>

        {/* Phase Ratings Section */}
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Card.Content>
            <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
              Phase Overview
            </Text>
            {completionData.phasesRatings.map((phaseRating) => {
              const config = ratingConfig[phaseRating.rating];
              return (
                <View key={phaseRating.phaseId} style={styles.phaseRow}>
                  <Text
                    variant="bodyMedium"
                    style={[styles.phaseTitle, { color: theme.colors.onSurface }]}
                    numberOfLines={2}
                  >
                    {getPhaseTitleById(phaseRating.phaseId)}
                  </Text>
                  <Chip
                    style={[styles.ratingChip, { backgroundColor: config.color }]}
                    textStyle={styles.ratingChipText}
                    compact={false}
                  >
                    {config.icon} {config.label}
                  </Chip>
                </View>
              );
            })}
          </Card.Content>
        </Card>

        {/* Next Focus Areas Section */}
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Card.Content>
            <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
              Suggested Focus Areas
            </Text>
            <Text
              variant="bodySmall"
              style={[styles.focusSubtitle, { color: theme.colors.onSurfaceVariant }]}
            >
              Concepts to review next
            </Text>
            {completionData.nextFocusAreas.map((area, index) => (
              <View key={index} style={styles.focusAreaRow}>
                <Text variant="bodyMedium" style={[styles.focusAreaNumber, { color: theme.colors.primary }]}>
                  {index + 1}.
                </Text>
                <Text variant="bodyMedium" style={[styles.focusAreaText, { color: theme.colors.onSurface }]}>
                  {area}
                </Text>
              </View>
            ))}
          </Card.Content>
        </Card>

        <Button mode="contained" onPress={handleGoToTopics} style={styles.button}>
          Back to Topics
        </Button>
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
  title: {
    marginBottom: 20,
    textAlign: 'center',
  },
  loadingText: {
    marginTop: 16,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
  },
  card: {
    marginBottom: 16,
    borderRadius: 12,
  },
  sectionTitle: {
    marginBottom: 12,
    fontWeight: '600',
  },
  phaseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  phaseTitle: {
    flex: 1,
    marginRight: 12,
  },
  ratingChip: {
    minHeight: 32,
    paddingVertical: 4,
  },
  ratingChipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    paddingVertical: 2,
  },
  focusSubtitle: {
    marginBottom: 12,
  },
  focusAreaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 6,
  },
  focusAreaNumber: {
    width: 24,
    fontWeight: '600',
  },
  focusAreaText: {
    flex: 1,
  },
  button: {
    marginTop: 8,
    alignSelf: 'center',
    minWidth: 200,
  },
});
