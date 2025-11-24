import { View, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Text, Button, TextInput, ActivityIndicator, useTheme } from 'react-native-paper';
import { trpc } from '@/lib/trpc';
import { useState } from 'react';

export default function DrillFocusSelectionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { topicId } = useLocalSearchParams<{ topicId: string }>();
  const [customFocus, setCustomFocus] = useState('');
  
  const topicQuery = trpc.learningTopics.list.useQuery();
  const topic = topicQuery.data?.find(t => t.id.toString() === topicId);

  const createSessionMutation = trpc.drill.createSession.useMutation({
    onSuccess: (data) => {
      router.push(`/practice/drill/chat/${data.sessionId}`);
    },
  });

  const handleEverything = () => {
    createSessionMutation.mutate({
      learningTopicId: parseInt(topicId),
      focusSelection: null,
    });
  };

  const handleCustomFocus = () => {
    if (customFocus.trim()) {
      createSessionMutation.mutate({
        learningTopicId: parseInt(topicId),
        focusSelection: {
          focusType: 'custom',
          value: customFocus.trim(),
        },
      });
    }
  };

  if (topicQuery.isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!topic) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Text>Topic not found</Text>
      </View>
    );
  }

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
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
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
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
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
  orText: {
    textAlign: 'center',
    marginBottom: 24,
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

