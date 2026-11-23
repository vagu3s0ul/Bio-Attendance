import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { COLORS, FONT, LABEL_CAPS, RADIUS, SHADOW } from '@/constants/theme';

/**
 * Bento stat tile: label-caps micro-label on top, thin headline number below
 * (headline-lg per the M3 scale).
 */
export default function StatCard({
  label,
  value,
  valueColor = COLORS.text,
  accent,
  center,
  style,
  labelColor,
}: {
  label: string;
  value: string | number;
  valueColor?: string;
  accent?: boolean; // primary-tinted number (e.g. today's entries)
  center?: boolean; // centre the label and value inside the tile
  style?: StyleProp<ViewStyle>; // extra card styling (e.g. translucent on a gradient)
  labelColor?: string; // overrides the muted label colour
}) {
  return (
    <View style={[styles.card, style, center && styles.cardCenter]}>
      <Text
        style={[
          styles.label,
          LABEL_CAPS,
          center && styles.textCenter,
          labelColor ? { color: labelColor } : null,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.value,
          center && styles.textCenter,
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
  cardCenter: { alignItems: 'center', justifyContent: 'center' },
  textCenter: { textAlign: 'center' },
  label: { color: COLORS.textMuted },
  value: { fontSize: 30, fontFamily: FONT.display, fontWeight: '300', lineHeight: 38, letterSpacing: -0.5 },
});
