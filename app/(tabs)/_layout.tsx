import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONT, RADIUS } from '@/constants/theme';
import { useSession } from '@/store/session';

const TAB_ITEMS: {
  name: 'index' | 'entry' | 'reports' | 'settings';
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { name: 'index', label: 'Home', icon: 'home' },
  { name: 'entry', label: 'Entry', icon: 'checkbox' },
  { name: 'reports', label: 'Reports', icon: 'analytics' },
  { name: 'settings', label: 'Profile', icon: 'person' },
];

function Avatar() {
  const { user } = useSession();
  const initial = (user?.name || user?.username || 'U').charAt(0).toUpperCase();
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{initial}</Text>
    </View>
  );
}

function TabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {TAB_ITEMS.map((item, idx) => {
        const active = state.index === idx;
        return (
          <Pressable
            key={item.name}
            style={({ pressed }) => [
              styles.tabItem,
              active && styles.tabItemActive,
              pressed && styles.tabItemPressed,
            ]}
            onPress={() => navigation.navigate(item.name)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Ionicons
              name={item.icon}
              size={22}
              color={active ? COLORS.onPrimary : COLORS.textMuted}
            />
            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.surface },
        headerTitle: 'SPSC',
        headerTitleAlign: 'left',
        headerTitleStyle: {
          fontFamily: FONT.bold,
          fontWeight: '700',
          fontSize: 20,
          color: COLORS.primary,
          letterSpacing: 0.5,
        },
        headerShadowVisible: true,
        headerRight: () => <Avatar />,
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
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.outline,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 16,
    paddingVertical: 5,
    borderRadius: RADIUS.md,
    backgroundColor: 'transparent',
  },
  tabItemActive: { backgroundColor: COLORS.primary },
  tabItemPressed: { opacity: 0.85, transform: [{ scale: 0.96 }] },
  tabLabel: {
    fontSize: 11,
    fontFamily: FONT.medium,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  tabLabelActive: { color: COLORS.onPrimary },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontFamily: FONT.medium,
    fontWeight: '600',
    color: COLORS.primary,
  },
});
