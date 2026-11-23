import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONT, M3 } from '@/constants/theme';

/** Base bar height above the safe-area inset (design h-20 = 80px incl. label). */
export const BOTTOM_NAV_BASE = 76;

const ITEMS: {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconOn: keyof typeof Ionicons.glyphMap;
  href: string;
}[] = [
  { key: 'home', label: 'Home', icon: 'home-outline', iconOn: 'home', href: '/(tabs)' },
  { key: 'entry', label: 'Entry', icon: 'create-outline', iconOn: 'create', href: '/entry' },
  { key: 'reports', label: 'Reports', icon: 'bar-chart-outline', iconOn: 'bar-chart', href: '/reports' },
  { key: 'notices', label: 'Notices', icon: 'notifications-outline', iconOn: 'notifications', href: '/notices' },
  { key: 'more', label: 'More', icon: 'ellipsis-horizontal', iconOn: 'ellipsis-horizontal', href: '/settings' },
];

export default function BottomNav({
  active,
  notices = 0,
  flow = false,
}: {
  active?: string;
  notices?: number;
  /** Render in normal document flow (relative) instead of absolute overlay. */
  flow?: boolean;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, flow && styles.barFlow]}>
      <View style={[styles.inner, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        {ITEMS.map((item) => {
          const on = active === item.key;
          return (
            <Pressable
              key={item.key}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
              onPress={() => router.navigate(item.href as never)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <View style={[styles.pill, on && styles.pillOn]}>
                <Ionicons
                  name={on ? item.iconOn : item.icon}
                  size={22}
                  color={on ? M3.primary : M3.onSurfaceVariant}
                />
                {item.key === 'notices' && notices > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{notices > 9 ? '9+' : notices}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    backgroundColor: 'rgba(247, 249, 252, 0.92)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: M3.outlineVariant,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 12,
  },
  barFlow: {
    position: 'relative',
    zIndex: 0,
    elevation: 0,
    shadowOpacity: 0,
  },
  inner: {
    width: '100%',
    maxWidth: 448,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: 10,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  pill: {
    width: 56,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillOn: { backgroundColor: M3.primaryFixed },
  label: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: FONT.medium,
    fontWeight: '600',
    color: M3.onSurfaceVariant,
  },
  labelOn: { color: M3.primary, fontFamily: FONT.bold, fontWeight: '700' },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: M3.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontFamily: FONT.bold,
    fontWeight: '700',
    color: M3.onError,
  },
  pressed: { opacity: 0.85 },
});
