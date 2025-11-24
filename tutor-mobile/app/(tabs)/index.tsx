import { StyleSheet, View } from 'react-native';
import { SignedIn, SignedOut, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { Text, ActivityIndicator, Button, useTheme } from 'react-native-paper';
import { SignOutButton } from '@/components/sign-out-button';
import { trpc } from '@/lib/trpc';

export default function HomeScreen() {
  const { user } = useUser();
  const router = useRouter();
  const theme = useTheme();
  const welcomeQuery = trpc.user.welcome.useQuery(undefined, {
    enabled: !!user, // Only run query when user is signed in
  });

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <SignedIn>
        <Text variant="headlineMedium" style={styles.title}>Authenticated!</Text>
        
        {welcomeQuery.isLoading && (
          <ActivityIndicator size="large" style={styles.loader} />
        )}
        
        {welcomeQuery.error && (
          <Text style={styles.error}>
            Error: {welcomeQuery.error.message}
          </Text>
        )}
        
        {welcomeQuery.data && (
          <Text variant="titleLarge" style={styles.welcome}>{welcomeQuery.data.message}</Text>
        )}
        
        <Text variant="bodyMedium" style={styles.email}>
          Email: {user?.emailAddresses[0].emailAddress}
        </Text>
        
        <View style={styles.buttonContainer}>
          <SignOutButton />
        </View>
      </SignedIn>
      
      <SignedOut>
        <Text variant="headlineMedium" style={styles.title}>Welcome to Tutor App</Text>
        <Text variant="bodyMedium" style={styles.subtitle}>Please sign in to continue</Text>
        
        <View style={styles.linkContainer}>
          <Button mode="contained" onPress={() => router.push('/(auth)/sign-in')} style={styles.button}>
            Sign In
          </Button>
          
          <Button mode="contained" onPress={() => router.push('/(auth)/sign-up')} style={styles.button}>
            Sign Up
          </Button>
        </View>
      </SignedOut>
    </View>
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
    marginBottom: 20,
    textAlign: 'center',
  },
  subtitle: {
    marginBottom: 30,
    textAlign: 'center',
  },
  welcome: {
    marginBottom: 20,
    textAlign: 'center',
  },
  email: {
    marginBottom: 30,
    textAlign: 'center',
  },
  linkContainer: {
    flexDirection: 'row',
    gap: 20,
  },
  button: {
    minWidth: 120,
  },
  buttonContainer: {
    marginTop: 20,
  },
  loader: {
    marginVertical: 20,
  },
  error: {
    color: 'red',
    marginBottom: 20,
    textAlign: 'center',
  },
});
