import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { router, Stack } from 'expo-router';
import { trpc } from '@/lib/trpc';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

export default function CreateTopicScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  
  const utils = trpc.useUtils();
  const createMutation = trpc.learningTopics.create.useMutation({
    onSuccess: () => {
      utils.learningTopics.list.invalidate();
      router.back();
    },
    onError: (error) => {
      Alert.alert('Error', error.message);
    },
  });

  const handleSubmit = () => {
    if (!title.trim() || !content.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    createMutation.mutate({ title, contentMd: content });
  };

  return (
    <>
      <Stack.Screen 
        options={{ 
          title: 'Create Topic', 
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
          <Text style={[styles.label, { color: colors.text }]}>Title</Text>
          <TextInput
            style={[styles.titleInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.tabIconDefault }]}
            value={title}
            onChangeText={setTitle}
            placeholder="Enter topic title"
            placeholderTextColor={colors.tabIconDefault}
          />

          <Text style={[styles.label, { color: colors.text }]}>Content</Text>
          <TextInput
            style={[styles.contentInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.tabIconDefault }]}
            value={content}
            onChangeText={setContent}
            placeholder="Enter content in Markdown format"
            placeholderTextColor={colors.tabIconDefault}
            multiline
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={[
              styles.submitButton, 
              { backgroundColor: colors.tint },
              (createMutation.isPending || !title.trim() || !content.trim()) && styles.submitButtonDisabled
            ]}
            onPress={handleSubmit}
            disabled={createMutation.isPending || !title.trim() || !content.trim()}
          >
            <Text style={styles.submitButtonText}>
              {createMutation.isPending ? 'Creating...' : 'Create Topic'}
            </Text>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 16,
  },
  titleInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 44,
  },
  contentInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 200,
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

