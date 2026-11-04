import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
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
import AppBottomNav from '@/components/AppBottomNav';
import { COLORS, FONT } from '@/constants/theme';
import { listenForReminderTaps } from '@/services/reminders';

function RootNavigator() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_300Light,
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const { ready } = useSession();

  // A tapped defaulter reminder opens the pre-filled WhatsApp chat.
  useEffect(() => listenForReminderTaps().remove, []);

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
      <View style={styles.root}>
        <View style={styles.content}>
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
              name="defaulters/index"
              options={{
                headerShown: false, // screen renders its own design-system app bar
              }}
            />
            <Stack.Screen
              name="fees/index"
              options={{
                headerShown: true,
                headerStyle: { backgroundColor: COLORS.surface },
                headerTintColor: COLORS.primary,
                headerTitle: 'Fee dues',
                headerTitleStyle: { fontFamily: FONT.medium, fontWeight: '600' },
                headerShadowVisible: true,
              }}
            />
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
              name="notices/index"
              options={{
                headerShown: true,
                headerStyle: { backgroundColor: COLORS.surface },
                headerTintColor: COLORS.primary,
                headerTitle: 'Notices',
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
        </View>
        <AppBottomNav />
      </View>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },
});

export default function RootLayout() {
  return (
    <SessionProvider>
      <RootNavigator />
    </SessionProvider>
  );
}
