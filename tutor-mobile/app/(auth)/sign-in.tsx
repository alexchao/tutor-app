import { useSignIn } from '@clerk/clerk-expo';
import { Link, useRouter } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { TextInput, Button, Text, useTheme } from 'react-native-paper';
import React from 'react';

export default function SignInPage() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();
  const theme = useTheme();

  const [emailAddress, setEmailAddress] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [pendingSecondFactor, setPendingSecondFactor] = React.useState(false);
  const [code, setCode] = React.useState('');

  const onSignInPress = async (): Promise<void> => {
    if (!isLoaded) return;

    try {
      const signInAttempt = await signIn.create({
        identifier: emailAddress,
        password,
      });

      if (signInAttempt.status === 'complete') {
        await setActive({ session: signInAttempt.createdSessionId });
        router.replace('/(tabs)');
      } else if (signInAttempt.status === 'needs_second_factor') {
        // Multi-factor authentication is enabled
        // Send verification code via email
        await signInAttempt.prepareSecondFactor({
          strategy: 'email_code',
        });
        setPendingSecondFactor(true);
        setError('');
      } else {
        console.error('Sign in attempt:', signInAttempt);
        setError('Sign in failed. Please try again.');
      }
    } catch (err: any) {
      console.error('Sign in error:', err);
      
      // Try to extract error message from various possible error formats
      let errorMessage = 'An error occurred during sign in';
      
      if (err.errors && err.errors.length > 0) {
        errorMessage = err.errors[0].message || err.errors[0].longMessage;
      } else if (err.message) {
        errorMessage = err.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      }
      
      setError(errorMessage);
    }
  };

  const onVerifyPress = async (): Promise<void> => {
    if (!isLoaded) return;

    try {
      const signInAttempt = await signIn.attemptSecondFactor({
        strategy: 'email_code',
        code,
      });

      if (signInAttempt.status === 'complete') {
        await setActive({ session: signInAttempt.createdSessionId });
        router.replace('/(tabs)');
      } else {
        console.error('Verification attempt:', signInAttempt);
        setError('Verification failed. Please try again.');
      }
    } catch (err: any) {
      console.error('Verification error:', err);
      
      let errorMessage = 'An error occurred during verification';
      
      if (err.errors && err.errors.length > 0) {
        errorMessage = err.errors[0].message || err.errors[0].longMessage;
      } else if (err.message) {
        errorMessage = err.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      }
      
      setError(errorMessage);
    }
  };

  if (pendingSecondFactor) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Text variant="headlineMedium" style={styles.title}>Verify your email</Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          We sent a verification code to {emailAddress}
        </Text>
        
        {error ? <Text style={styles.error}>{error}</Text> : null}
        
        <TextInput
          mode="outlined"
          value={code}
          placeholder="Enter verification code"
          onChangeText={(c) => setCode(c)}
          style={styles.input}
        />
        
        <Button mode="contained" onPress={onVerifyPress} style={styles.button}>
          Verify
        </Button>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Text variant="headlineMedium" style={styles.title}>Sign In</Text>
      
      {error ? <Text style={styles.error}>{error}</Text> : null}
      
      <TextInput
        mode="outlined"
        autoCapitalize="none"
        value={emailAddress}
        placeholder="Enter email"
        onChangeText={(email) => setEmailAddress(email)}
        style={styles.input}
      />
      
      <TextInput
        mode="outlined"
        value={password}
        placeholder="Enter password"
        secureTextEntry={true}
        onChangeText={(pwd) => setPassword(pwd)}
        style={styles.input}
      />
      
      <Button mode="contained" onPress={onSignInPress} style={styles.button}>
        Sign In
      </Button>
      
      <View style={styles.linkContainer}>
        <Text>Don't have an account? </Text>
        <Link href="/(auth)/sign-up">
          <Text style={styles.link}>Sign up</Text>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    marginBottom: 20,
    textAlign: 'center',
  },
  subtitle: {
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    marginBottom: 10,
  },
  button: {
    marginTop: 10,
  },
  linkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  link: {
    fontWeight: 'bold',
  },
  error: {
    color: 'red',
    marginBottom: 10,
    textAlign: 'center',
  },
});

