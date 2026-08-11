import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import {
  Inter_300Light,
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { SessionProvider, useSession } from '@/store/session';
import ErrorBoundary from '@/components/ErrorBoundary';
import { COLORS, FONT } from '@/constants/theme';

function RootNavigator() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_300Light,
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const { ready } = useSession();

  useEffect(() => {
    if ((fontsLoaded || fontError) && ready) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsLoaded, fontError, ready]);

  if (!fontsLoaded && !fontError) return null; // splash still visible
  if (!ready) return null;

  return (
    <ErrorBoundary>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: COLORS.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="manage" />
        <Stack.Screen
          name="notify"
          options={{
            headerShown: true,
            headerStyle: { backgroundColor: COLORS.surface },
            headerTintColor: COLORS.primary,
            headerTitle: 'Notify Parents',
            headerTitleStyle: { fontFamily: FONT.medium, fontWeight: '600' },
            headerShadowVisible: true,
          }}
        />
        <Stack.Screen
          name="web/[page]"
          options={{
            headerShown: true,
            headerStyle: { backgroundColor: COLORS.surface },
            headerTintColor: COLORS.primary,
            headerTitleStyle: { fontFamily: FONT.medium, fontWeight: '600' },
            headerShadowVisible: true,
          }}
        />
      </Stack>
    </ErrorBoundary>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <RootNavigator />
    </SessionProvider>
  );
}
