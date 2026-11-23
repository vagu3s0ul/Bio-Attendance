import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, FONT, RADIUS, SHADOW } from '@/constants/theme';

/**
 * Quick-action card from the teacher dashboard design.
 * `filled` renders the primary "Daily Entry" variant (blue card, white text);
 * the default is the white surface card with a muted icon well.
 */
export default function ActionCard({
  icon,
  title,
  subtitle,
  onPress,
  filled = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
  filled?: boolean;
}) {
  const tint = filled ? COLORS.onPrimary : COLORS.primary;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        filled && styles.cardFilled,
        pressed && styles.pressed,
      ]}
      android_ripple={{ color: filled ? 'rgba(255,255,255,0.15)' : COLORS.outline }}
    >
      <View style={[styles.iconWrap, filled ? styles.iconFilled : styles.iconOutline]}>
        <Ionicons name={icon} size={20} color={tint} />
      </View>
      <View style={styles.textWrap}>
        <Text style={[styles.title, filled && styles.titleFilled]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[styles.subtitle, filled && styles.subtitleFilled]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={filled ? 'rgba(255,255,255,0.85)' : COLORS.textMuted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 14,
    minHeight: 72,
    ...SHADOW.card,
  },
  cardFilled: { backgroundColor: COLORS.primary },
  pressed: { opacity: 0.92, transform: [{ scale: 0.985 }], ...SHADOW.lifted },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconFilled: { backgroundColor: 'rgba(255,255,255,0.2)' },
  iconOutline: { backgroundColor: COLORS.lavender },
  textWrap: { flex: 1 },
  title: { fontSize: 15, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  titleFilled: { color: COLORS.onPrimary },
  subtitle: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  subtitleFilled: { color: 'rgba(255,255,255,0.8)' },
});
