import { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { router, Stack } from 'expo-router';
import { TextInput, Button, Text, useTheme } from 'react-native-paper';
import { trpc } from '@/lib/trpc';

export default function CreateTopicScreen() {
  const theme = useTheme();
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
          <TextInput
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder="Enter topic title"
            mode="outlined"
            style={styles.titleInput}
          />

          <TextInput
            label="Content"
            value={content}
            onChangeText={setContent}
            placeholder="Enter content in Markdown format"
            mode="outlined"
            multiline
            numberOfLines={10}
            style={styles.contentInput}
          />

          <Button
            mode="contained"
            onPress={handleSubmit}
            disabled={createMutation.isPending || !title.trim() || !content.trim()}
            loading={createMutation.isPending}
            style={styles.submitButton}
          >
            {createMutation.isPending ? 'Creating...' : 'Create Topic'}
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  titleInput: {
    marginTop: 16,
  },
  contentInput: {
    marginTop: 16,
  },
  submitButton: {
    marginTop: 24,
  },
});

