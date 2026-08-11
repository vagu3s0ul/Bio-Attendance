import { Stack } from 'expo-router';
import { COLORS, FONT } from '@/constants/theme';

export default function ManageLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.surface },
        headerTintColor: COLORS.primary,
        headerTitleStyle: { fontFamily: FONT.medium, fontWeight: '600' },
        headerShadowVisible: true,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Manage' }} />
      <Stack.Screen name="students" options={{ title: 'Manage Students' }} />
      <Stack.Screen name="teachers" options={{ title: 'Manage Teachers' }} />
    </Stack>
  );
}
