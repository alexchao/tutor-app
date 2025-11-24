import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { trpc } from '@/lib/trpc';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

export default function TopicsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const topicsQuery = trpc.learningTopics.list.useQuery();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Learning Topics</Text>
        <TouchableOpacity 
          style={[styles.addButton, { backgroundColor: colors.tint || '#007AFF' }]}
          onPress={() => router.push('/create-topic')}
          activeOpacity={0.7}
        >
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      {topicsQuery.isLoading && (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      )}
      
      {topicsQuery.error && (
        <View style={styles.centerContainer}>
          <Text style={[styles.error, { color: colors.text }]}>
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
            <View style={[styles.topicCard, { backgroundColor: colors.background, borderColor: colors.tabIconDefault }]}>
              <Text style={[styles.topicTitle, { color: colors.text }]}>{item.title}</Text>
              <View style={styles.topicFooter}>
                <Text style={[styles.topicDate, { color: colors.tabIconDefault }]}>
                  {new Date(item.createdAt).toLocaleDateString()}
                </Text>
                <View style={styles.buttonContainer}>
                  <TouchableOpacity
                    style={[styles.readButton, { backgroundColor: colors.tabIconDefault }]}
                    onPress={() => router.push(`/topic/${item.id}`)}
                  >
                    <Text style={[styles.readButtonText, { color: colors.background }]}>Read</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.practiceButton, { backgroundColor: colors.tint }]}
                    onPress={() => router.push(`/practice-options/${item.id}`)}
                  >
                    <Text style={styles.practiceButtonText}>Practice</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        />
      ) : topicsQuery.data && topicsQuery.data.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={[styles.emptyText, { color: colors.tabIconDefault }]}>
            No topics yet. Create your first one!
          </Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 32,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  error: {
    fontSize: 16,
    textAlign: 'center',
  },
  listContent: {
    padding: 20,
    paddingTop: 10,
  },
  topicCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  topicTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  topicDate: {
    fontSize: 12,
  },
  topicFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  readButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  readButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  practiceButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  practiceButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
});

