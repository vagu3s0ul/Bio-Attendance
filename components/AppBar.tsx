import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, FONT, SPACING } from '@/constants/theme';
import { useSession } from '@/store/session';

/**
 * Top bar used across the refreshed screens: SPS emblem, campus label,
 * notification bell and the signed-in avatar (from the mockups).
 */
export default function AppBar({
  showBell = true,
  onBell,
}: {
  showBell?: boolean;
  onBell?: () => void;
}) {
  const router = useRouter();
  const { user } = useSession();
  const initial = (user?.name || user?.username || 'U').charAt(0).toUpperCase();

  return (
    <View style={styles.bar}>
      <View style={styles.emblem}>
        <Ionicons name="school" size={16} color={COLORS.primary} />
      </View>
      <View style={styles.titles}>
        <Text style={styles.title} numberOfLines={1}>
          SPS Attendance
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          Sialkot Campus
        </Text>
      </View>
      {showBell ? (
        <Pressable
          onPress={onBell ?? (() => router.push('/notices'))}
          hitSlop={10}
          style={({ pressed }) => [styles.bell, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
        >
          <Ionicons name="notifications-outline" size={20} color={COLORS.text} />
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => router.push('/settings' as any)}
        style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Profile"
      >
        <Text style={styles.avatarText}>{initial}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: SPACING.lg,
    paddingTop: 6,
    paddingBottom: SPACING.md,
  },
  emblem: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.chipIdle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titles: { flex: 1 },
  title: { fontSize: 16, fontFamily: FONT.bold, fontWeight: '700', color: COLORS.text },
  sub: { fontSize: 11.5, color: COLORS.textMuted, fontFamily: FONT.regular },
  bell: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.chipIdle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 14, fontFamily: FONT.medium, fontWeight: '600', color: '#fff' },
  pressed: { opacity: 0.85 },
});
