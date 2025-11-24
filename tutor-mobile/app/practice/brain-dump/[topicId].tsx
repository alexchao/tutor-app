import { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { TextInput, Button, Text, ActivityIndicator, Card, useTheme } from 'react-native-paper';
import { trpc } from '@/lib/trpc';

export default function BrainDumpScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { topicId } = useLocalSearchParams<{ topicId: string }>();
  const [response, setResponse] = useState('');

  const topicQuery = trpc.learningTopics.list.useQuery();
  const topic = topicQuery.data?.find(t => t.id.toString() === topicId);

  const submitMutation = trpc.practice.submitBrainDump.useMutation({
    onSuccess: (data) => {
      router.replace(`/practice/results/${data.submissionId}`);
    },
    onError: (error) => {
      Alert.alert('Error', error.message);
    },
  });

  const handleSubmit = () => {
    if (!topic) return;
    
    submitMutation.mutate({
      learningTopicId: topic.id,
      questionPrompt: 'Explain as much as you can about this topic.',
      studentResponse: response,
    });
  };

  if (topicQuery.isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!topic) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <Text>Topic not found</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: topic.title,
          headerBackTitle: 'Back',
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.onBackground,
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Card style={styles.questionCard}>
            <Card.Content>
              <Text variant="titleMedium">
                Explain as much as you can about this topic.
              </Text>
            </Card.Content>
          </Card>

          <TextInput
            mode="outlined"
            value={response}
            onChangeText={setResponse}
            placeholder="Type your response here..."
            multiline
            numberOfLines={12}
            style={styles.textarea}
          />

          <Button
            mode="contained"
            onPress={handleSubmit}
            disabled={!response.trim() || submitMutation.isPending}
            loading={submitMutation.isPending}
            style={styles.submitButton}
          >
            {submitMutation.isPending ? 'Submitting...' : 'Submit'}
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  questionCard: {
    marginBottom: 24,
  },
  textarea: {
    marginBottom: 16,
  },
  submitButton: {
    marginTop: 8,
  },
});

