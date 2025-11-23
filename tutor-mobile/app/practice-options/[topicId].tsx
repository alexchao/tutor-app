import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { trpc } from '@/lib/trpc';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

export default function PracticeOptionsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { topicId } = useLocalSearchParams<{ topicId: string }>();
  
  const topicQuery = trpc.learningTopics.list.useQuery();
  const topic = topicQuery.data?.find(t => t.id.toString() === topicId);

  if (topicQuery.isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  if (!topic) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
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
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.heading, { color: colors.text }]}>Choose Practice Type</Text>
        
        <TouchableOpacity
          style={[styles.optionCard, { backgroundColor: colors.background, borderColor: colors.tabIconDefault }]}
          onPress={() => router.push(`/practice/brain-dump/${topicId}`)}
        >
          <Text style={[styles.optionTitle, { color: colors.text }]}>Brain Dump</Text>
          <Text style={[styles.optionDescription, { color: colors.tabIconDefault }]}>
            Write everything you know about this topic
          </Text>
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
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  optionCard: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  optionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  optionDescription: {
    fontSize: 16,
    lineHeight: 22,
  },
});

