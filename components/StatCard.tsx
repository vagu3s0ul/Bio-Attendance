import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, FONT, LABEL_CAPS, RADIUS, SHADOW } from '@/constants/theme';

/**
 * Bento stat tile: label-caps micro-label on top, bold headline number below
 * (headline-lg per the M3 scale).
 */
export default function StatCard({
  label,
  value,
  valueColor = COLORS.text,
  accent,
}: {
  label: string;
  value: string | number;
  valueColor?: string;
  accent?: boolean; // primary-tinted number (e.g. today's entries)
}) {
  return (
    <View style={styles.card}>
      <Text style={[styles.label, LABEL_CAPS]} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[
          styles.value,
          { color: accent ? COLORS.primary : valueColor },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    height: 104,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 14,
    justifyContent: 'space-between',
    ...SHADOW.card,
  },
  label: { color: COLORS.textMuted },
  value: { fontSize: 30, fontFamily: FONT.bold, fontWeight: '700', lineHeight: 38, letterSpacing: -0.5 },
});
