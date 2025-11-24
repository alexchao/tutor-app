import { useClerk } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { Button } from 'react-native-paper';

export function SignOutButton() {
  const { signOut } = useClerk();
  const router = useRouter();
  
  const handleSignOut = async (): Promise<void> => {
    try {
      await signOut();
      router.replace('/(tabs)');
    } catch (err) {
      console.error('Error signing out:', err);
    }
  };
  
  return <Button mode="contained" onPress={handleSignOut}>Sign Out</Button>;
}

