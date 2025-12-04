import { View, StyleSheet, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Text, ActivityIndicator, Card, Button, FAB, useTheme } from 'react-native-paper';
import { trpc } from '@/lib/trpc';

export default function TopicsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const topicsQuery = trpc.learningTopics.list.useQuery();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text variant="headlineMedium" style={styles.title}>Learning Topics</Text>
      </View>

      {topicsQuery.isLoading && (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" />
        </View>
      )}
      
      {topicsQuery.error && (
        <View style={styles.centerContainer}>
          <Text style={styles.error}>
            Error: {topicsQuery.error.message}
          </Text>
        </View>
      )}
      
      {topicsQuery.data && topicsQuery.data.length > 0 ? (
        <FlatList
          data={topicsQuery.data}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Card style={styles.topicCard}>
              <Card.Content>
                <Text variant="titleLarge" style={styles.topicTitle}>{item.title}</Text>
                <View style={styles.topicFooter}>
                  <View>
                    <Text variant="bodySmall" style={styles.topicDate}>
                      {item.lastPracticedAt ? 'Last practiced' : 'Never practiced'}
                    </Text>
                    {item.lastPracticedAt && (
                      <Text variant="bodySmall" style={[styles.topicDate, styles.boldDate]}>
                        {new Date(item.lastPracticedAt).toLocaleDateString()}
                      </Text>
                    )}
                  </View>
                  <View style={styles.buttonContainer}>
                    <Button
                      mode="outlined"
                      onPress={() => router.push(`/topic/${item.id}`)}
                      style={styles.readButton}
                    >
                      Read
                    </Button>
                    <Button
                      mode="contained"
                      onPress={() => router.push(`/practice-options/${item.id}`)}
                      style={styles.practiceButton}
                    >
                      Practice
                    </Button>
                  </View>
                </View>
              </Card.Content>
            </Card>
          )}
        />
      ) : topicsQuery.data && topicsQuery.data.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text variant="bodyLarge" style={styles.emptyText}>
            No topics yet. Create your first one!
          </Text>
        </View>
      ) : null}
      
      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => router.push('/create-topic')}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  title: {
    fontWeight: 'bold',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  error: {
    color: 'red',
    textAlign: 'center',
  },
  listContent: {
    padding: 20,
    paddingTop: 10,
    paddingBottom: 80,
  },
  topicCard: {
    marginBottom: 12,
  },
  topicTitle: {
    marginBottom: 8,
  },
  topicDate: {
    marginTop: 4,
  },
  boldDate: {
    fontWeight: 'bold',
  },
  topicFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  readButton: {
    marginLeft: 8,
  },
  practiceButton: {
    marginLeft: 8,
  },
  emptyText: {
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
  },
});

