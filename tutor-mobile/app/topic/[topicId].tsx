import { View, StyleSheet, ScrollView } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Text, ActivityIndicator, useTheme } from 'react-native-paper';
import { trpc } from '@/lib/trpc';
import { Markdown } from 'react-native-remark';

export default function ReadTopicScreen() {
  const theme = useTheme();
  const { topicId } = useLocalSearchParams<{ topicId: string }>();
  
  const topicQuery = trpc.learningTopics.list.useQuery();
  const topic = topicQuery.data?.find(t => t.id.toString() === topicId);

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
        <View style={styles.errorContainer}>
          <Text>Topic not found</Text>
        </View>
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
      <ScrollView 
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.content}>
          <Markdown markdown={topic.contentMd} />
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  content: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
});

