import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Text, ActivityIndicator, Card, useTheme } from 'react-native-paper';
import { trpc } from '@/lib/trpc';

export default function PracticeOptionsScreen() {
  const theme = useTheme();
  const router = useRouter();
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
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Text variant="headlineSmall" style={styles.heading}>Choose Practice Type</Text>
        
        <TouchableOpacity
          onPress={() => router.push(`/practice/brain-dump/${topicId}`)}
        >
          <Card style={styles.optionCard}>
            <Card.Content>
              <Text variant="titleLarge" style={styles.optionTitle}>Brain Dump</Text>
              <Text variant="bodyMedium" style={styles.optionDescription}>
                Write everything you know about this topic
              </Text>
            </Card.Content>
          </Card>
        </TouchableOpacity>
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
    marginBottom: 24,
  },
  optionCard: {
    marginBottom: 16,
  },
  optionTitle: {
    marginBottom: 8,
  },
  optionDescription: {
    marginTop: 4,
  },
});

