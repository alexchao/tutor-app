import { View, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Text, Button, useTheme } from 'react-native-paper';

export default function DrillResultsScreen() {
  const theme = useTheme();
  const router = useRouter();

  const handleGoToTopics = () => {
    router.replace('/(tabs)/topics');
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Drill Results',
          headerBackTitle: 'Back',
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.onBackground,
        }}
      />
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.onBackground }]}>
          Drill Complete!
        </Text>
        <Text variant="bodyLarge" style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
          Results coming soon...
        </Text>
        <Button
          mode="contained"
          onPress={handleGoToTopics}
          style={styles.button}
        >
          Back to Topics
        </Button>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    marginBottom: 32,
    textAlign: 'center',
  },
  button: {
    minWidth: 200,
  },
});



