import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
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
import AnimatedSplash from '@/components/AnimatedSplash';
import { COLORS, FONT } from '@/constants/theme';
import { listenForReminderTaps } from '@/services/reminders';
import { AppState } from 'react-native';
import {
  pollNotifications,
  registerPushToken,
  requestNotificationPermission,
  setLastSeenId,
} from '@/services/notifications';
import { fetchUpdateInfo, installedInfo, isUpdateAvailable } from '@/services/updates';
import { Alert } from 'react-native';

function RootNavigator() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_300Light,
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const { ready, user } = useSession();
  const router = useRouter();
  const [splashDone, setSplashDone] = useState(false);

  // A tapped defaulter reminder opens the pre-filled WhatsApp chat.
  useEffect(() => listenForReminderTaps().remove, []);

  // Poll the school site for push notifications (no FCM/Play Store needed).
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    (async () => {
      await requestNotificationPermission();
      await pollNotifications();
      timer = setInterval(() => {
        if (active) void pollNotifications();
      }, 30000);
    })();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && active) void pollNotifications();
    });
    return () => {
      active = false;
      if (timer) clearInterval(timer);
      sub.remove();
    };
  }, []);

  // Real push: register this phone's Expo push token once signed in, so
  // notifications pop up even with the app closed. Quiet no-op when push
  // is not configured (no EAS project id) — polling above keeps working.
  useEffect(() => {
    if (!ready || !user) return;
    void registerPushToken();
  }, [ready, user]);

  // Push / notification taps: only app notifications (data.notificationId)
  // open the inbox. Other local notifications (e.g. defaulter reminders)
  // are left to their own listeners — this must not hijack them.
  useEffect(() => {
    const receivedSub = Notifications.addNotificationReceivedListener((response) => {
      const id = (response?.request?.content?.data as any)?.notificationId;
      if (id) void setLastSeenId(String(id));
    });
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = (response?.notification?.request?.content?.data as any) || {};
      if (!data.notificationId) return;
      void setLastSeenId(String(data.notificationId));
      router.replace('/notifications');
    });
    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, [router]);

  // Silent update check on startup (sideloaded builds only).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const info = await fetchUpdateInfo();
        if (!active || !info) return;
        const installed = installedInfo();
        if (isUpdateAvailable(info, installed)) {
          Alert.alert(
            'Update available',
            `${info.version} is available (you have ${installed.version}). Open Profile → App updates to install.`,
            [{ text: 'OK' }]
          );
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      active = false;
    };
  }, []);

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
                headerShown: false, // screen renders its own design-time header bar
              }}
            />
            <Stack.Screen
              name="notify"
              options={{
                headerShown: false, // screen renders its own design-time header bar
              }}
            />
            <Stack.Screen
              name="notices/index"
              options={{
                headerShown: false, // screen renders its own design-system app bar
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
      {!splashDone && <AnimatedSplash onFinish={() => setSplashDone(true)} />}
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
