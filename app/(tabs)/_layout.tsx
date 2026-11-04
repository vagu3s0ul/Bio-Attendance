import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { COLORS, FONT } from '@/constants/theme';
import { useSession } from '@/store/session';

export default function TabsLayout() {
  const { user } = useSession();
  const initial = (user?.name || user?.username || 'U').charAt(0).toUpperCase();

  return (
    <Tabs
      tabBar={() => null}
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: COLORS.background },
        headerShadowVisible: false,
        headerTitleAlign: 'left',
        headerTitleStyle: {
          fontFamily: FONT.medium,
          fontWeight: '600',
          fontSize: 19,
          color: COLORS.text,
        },
        headerRight: () => (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
        ),
        headerRightContainerStyle: { paddingRight: 16 },
        headerLeftContainerStyle: { paddingLeft: 16 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="entry" options={{ title: 'Entry' }} />
      <Tabs.Screen name="reports" options={{ title: 'Reports' }} />
      <Tabs.Screen name="settings" options={{ title: 'Profile' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 14, fontFamily: FONT.medium, fontWeight: '600', color: '#fff' },
});
