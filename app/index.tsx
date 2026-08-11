import { Redirect } from 'expo-router';
import { useSession } from '@/store/session';

export default function Index() {
  const { ready, user } = useSession();
  if (!ready) return null; // splash screen is still visible
  return <Redirect href={user ? '/(tabs)' : '/(auth)/login'} />;
}
