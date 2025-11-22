import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { SignedIn, SignedOut, useUser } from '@clerk/clerk-expo';
import { Link } from 'expo-router';
import { SignOutButton } from '@/components/sign-out-button';
import { trpc } from '@/lib/trpc';

export default function HomeScreen() {
  const { user } = useUser();
  const welcomeQuery = trpc.user.welcome.useQuery(undefined, {
    enabled: !!user, // Only run query when user is signed in
  });

  return (
    <View style={styles.container}>
      <SignedIn>
        <Text style={styles.title}>Authenticated!</Text>
        
        {welcomeQuery.isLoading && (
          <ActivityIndicator size="large" style={styles.loader} />
        )}
        
        {welcomeQuery.error && (
          <Text style={styles.error}>
            Error: {welcomeQuery.error.message}
          </Text>
        )}
        
        {welcomeQuery.data && (
          <Text style={styles.welcome}>{welcomeQuery.data.message}</Text>
        )}
        
        <Text style={styles.email}>
          Email: {user?.emailAddresses[0].emailAddress}
        </Text>
        
        <View style={styles.buttonContainer}>
          <SignOutButton />
        </View>
      </SignedIn>
      
      <SignedOut>
        <Text style={styles.title}>Welcome to Tutor App</Text>
        <Text style={styles.subtitle}>Please sign in to continue</Text>
        
        <View style={styles.linkContainer}>
          <Link href="/(auth)/sign-in" style={styles.link}>
            <Text style={styles.linkText}>Sign In</Text>
          </Link>
          
          <Link href="/(auth)/sign-up" style={styles.link}>
            <Text style={styles.linkText}>Sign Up</Text>
          </Link>
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
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 30,
    textAlign: 'center',
    color: '#666',
  },
  welcome: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
    color: '#007AFF',
  },
  email: {
    fontSize: 16,
    marginBottom: 30,
    textAlign: 'center',
    color: '#666',
  },
  linkContainer: {
    flexDirection: 'row',
    gap: 20,
  },
  link: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 8,
  },
  linkText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
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
