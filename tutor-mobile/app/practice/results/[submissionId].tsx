import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { trpc } from '@/lib/trpc';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Markdown } from 'react-native-remark';

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_DURATION_MS = 60000;

export default function ResultsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { submissionId } = useLocalSearchParams<{ submissionId: string }>();
  const [pollCount, setPollCount] = useState(0);

  const submissionQuery = trpc.practice.getSubmissionResult.useQuery(
    { submissionId: Number(submissionId) },
    {
      refetchInterval: (query) => {
        // Stop polling if grading is complete or max duration reached
        const submission = query.state.data;
        if (submission?.gradingCompletedAt || pollCount * POLL_INTERVAL_MS >= MAX_POLL_DURATION_MS) {
          return false;
        }
        return POLL_INTERVAL_MS;
      },
    }
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setPollCount((prev) => prev + 1);
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  const submission = submissionQuery.data;
  const isGrading = submission && !submission.gradingCompletedAt;
  const gradingResult = submission?.gradingResult as { criteria: Array<{ title: string; result: string; feedbackMd: string }> } | null;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Results',
          headerBackTitle: 'Back',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
        }}
      />
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
        {isGrading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.tint} />
            <Text style={[styles.loadingText, { color: colors.text }]}>
              Grading your response...
            </Text>
          </View>
        )}

        {gradingResult && (
          <View style={styles.resultsContainer}>
            <Text style={[styles.heading, { color: colors.text }]}>Grading Results</Text>
            {gradingResult.criteria.map((criterion, index) => (
              <View
                key={index}
                style={[styles.criterionCard, { backgroundColor: colors.background, borderColor: colors.tabIconDefault }]}
              >
                <View style={styles.criterionHeader}>
                  <Text style={[styles.criterionTitle, { color: colors.text }]}>
                    {criterion.title}
                  </Text>
                  <Text
                    style={[
                      styles.criterionResult,
                      criterion.result === 'SATISFIED' && styles.resultSatisfied,
                      criterion.result === 'PARTIALLY_SATISFIED' && styles.resultPartial,
                      criterion.result === 'NOT_SATISFIED' && styles.resultNotSatisfied,
                    ]}
                  >
                    {criterion.result === 'SATISFIED' && '✓'}
                    {criterion.result === 'PARTIALLY_SATISFIED' && '~'}
                    {criterion.result === 'NOT_SATISFIED' && '✗'}
                  </Text>
                </View>
                <View style={styles.feedback}>
                  <Markdown markdown={criterion.feedbackMd} />
                </View>
              </View>
            ))}
          </View>
        )}

        {!isGrading && !gradingResult && (
          <View style={styles.errorContainer}>
            <Text style={[styles.errorText, { color: colors.text }]}>
              Unable to load results. Please try again.
            </Text>
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  resultsContainer: {
    paddingBottom: 20,
  },
  heading: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  criterionCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  criterionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  criterionTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  criterionResult: {
    fontSize: 24,
    fontWeight: 'bold',
    marginLeft: 12,
  },
  resultSatisfied: {
    color: '#34C759',
  },
  resultPartial: {
    color: '#FF9500',
  },
  resultNotSatisfied: {
    color: '#FF3B30',
  },
  feedback: {
    fontSize: 16,
    lineHeight: 22,
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
});


