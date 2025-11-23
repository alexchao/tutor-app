import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { trpc } from '@/lib/trpc';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

export default function BrainDumpScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { topicId } = useLocalSearchParams<{ topicId: string }>();
  const [response, setResponse] = useState('');

  const topicQuery = trpc.learningTopics.list.useQuery();
  const topic = topicQuery.data?.find(t => t.id.toString() === topicId);

  const handleSubmit = () => {
    // TODO: Submit functionality will be implemented later
    console.log('Brain dump response:', response);
  };

  if (topicQuery.isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  if (!topic) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Topic not found</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: topic.title,
          headerBackTitle: 'Back',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.questionCard, { backgroundColor: colors.background, borderColor: colors.tabIconDefault }]}>
            <Text style={[styles.question, { color: colors.text }]}>
              Explain as much as you can about this topic.
            </Text>
          </View>

          <TextInput
            style={[styles.textarea, { backgroundColor: colors.background, color: colors.text, borderColor: colors.tabIconDefault }]}
            value={response}
            onChangeText={setResponse}
            placeholder="Type your response here..."
            placeholderTextColor={colors.tabIconDefault}
            multiline
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={[
              styles.submitButton,
              { backgroundColor: colors.tint },
              !response.trim() && styles.submitButtonDisabled
            ]}
            onPress={handleSubmit}
            disabled={!response.trim()}
          >
            <Text style={styles.submitButtonText}>Submit</Text>
          </TouchableOpacity>
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
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 24,
  },
  question: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 26,
  },
  textarea: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    minHeight: 300,
    lineHeight: 24,
  },
  submitButton: {
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

