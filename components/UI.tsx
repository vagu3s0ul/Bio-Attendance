import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT, RADIUS, SHADOW, SPACING } from '@/constants/theme';

/**
 * Shared building blocks for the 2026 Bio Attendance UI refresh:
 * pastel icon wells, pill badges, bento stat tiles, portal grids and
 * section headers — the language used across every mockup.
 */

export type Tone = 'lavender' | 'mint' | 'sky' | 'peach' | 'rose' | 'violet' | 'lime' | 'slate';

const TONE_BG: Record<Tone, string> = {
  lavender: COLORS.primarySoft,
  mint: COLORS.mintSoft,
  sky: COLORS.skySoft,
  peach: COLORS.peachSoft,
  rose: COLORS.roseSoft,
  violet: COLORS.violetSoft,
  lime: COLORS.limeSoft,
  slate: COLORS.chipIdle,
};

const TONE_FG: Record<Tone, string> = {
  lavender: COLORS.primary,
  mint: COLORS.success,
  sky: COLORS.secondary,
  peach: COLORS.warning,
  rose: COLORS.danger,
  violet: '#6D4AC7',
  lime: '#3F8F2E',
  slate: COLORS.textMuted,
};

export function IconTile({
  icon,
  tone = 'slate',
  size = 44,
  radius = 14,
  iconSize = 21,
  style,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tone?: Tone;
  size?: number;
  radius?: number;
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: TONE_BG[tone],
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Ionicons name={icon} size={iconSize} color={TONE_FG[tone]} />
    </View>
  );
}

export function Pill({
  label,
  tone = 'slate',
  solid = false,
  icon,
}: {
  label: string;
  tone?: Tone;
  solid?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: solid ? TONE_FG[tone] : TONE_BG[tone] },
      ]}
    >
      {icon ? (
        <Ionicons name={icon} size={11} color={solid ? '#fff' : TONE_FG[tone]} />
      ) : null}
      <Text style={[styles.pillText, { color: solid ? '#fff' : TONE_FG[tone] }]}>{label}</Text>
    </View>
  );
}

/** Bento stat tile: icon well (top-right), value, caption, optional pill. */
export function StatTile({
  label,
  value,
  sub,
  icon,
  tone = 'lavender',
  badge,
  badgeTone = 'mint',
  valueColor = COLORS.text,
  style,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: Tone;
  badge?: string;
  badgeTone?: Tone;
  valueColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.statTile, style]}>
      <View style={styles.statTop}>
        <Text style={styles.statLabel} numberOfLines={1}>
          {label}
        </Text>
        {icon ? <IconTile icon={icon} tone={tone} size={34} radius={11} iconSize={17} /> : null}
      </View>
      <Text style={[styles.statValue, { color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <View style={styles.statBottom}>
        {sub ? (
          <Text style={styles.statSub} numberOfLines={1}>
            {sub}
          </Text>
        ) : (
          <View />
        )}
        {badge ? <Pill label={badge} tone={badgeTone} /> : null}
      </View>
    </View>
  );
}

/** Quick-action portal tile (3-across or 2-across grids). */
export function QuickTile({
  icon,
  title,
  subtitle,
  tone = 'lavender',
  badge,
  badgeTone = 'sky',
  dot = false,
  onPress,
  columns = 3,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  tone?: Tone;
  badge?: string;
  badgeTone?: Tone;
  dot?: boolean;
  onPress: () => void;
  columns?: 2 | 3;
}) {
  const compact = columns === 3;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        compact ? styles.quickCompact : styles.quickWide,
        pressed && styles.pressed,
      ]}
      android_ripple={{ color: COLORS.field }}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.quickTop}>
        <IconTile icon={icon} tone={tone} size={compact ? 42 : 40} radius={13} />
        {badge ? <Pill label={badge} tone={badgeTone} /> : null}
        {dot ? <View style={styles.dot} /> : null}
        {!compact && !badge && !dot ? (
          <Ionicons name="arrow-forward" size={17} color={COLORS.textFaint} />
        ) : null}
      </View>
      <Text style={compact ? styles.quickTitleCompact : styles.quickTitle} numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={styles.quickSub} numberOfLines={compact ? 1 : 2}>
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function SectionHeader({
  title,
  sub,
  action,
  onAction,
  style,
}: {
  title: string;
  sub?: string;
  action?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <View style={styles.flex}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {sub ? <Text style={styles.sectionSub}>{sub}</Text> : null}
      </View>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** White radius-24 surface used by hero panels and grouped lists. */
export function Panel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function ListRow({
  icon,
  tone = 'lavender',
  title,
  sub,
  right,
  onPress,
  last = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tone?: Tone;
  title: string;
  sub?: string;
  right?: string;
  onPress?: () => void;
  last?: boolean;
}) {
  const body = (
    <View style={[styles.listRow, !last && styles.listRowBorder]}>
      <IconTile icon={icon} tone={tone} size={42} radius={13} iconSize={19} />
      <View style={styles.flex}>
        <Text style={styles.listTitle} numberOfLines={1}>
          {title}
        </Text>
        {sub ? (
          <Text style={styles.listSub} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {right ? <Text style={styles.listRight}>{right}</Text> : null}
      {onPress ? <Ionicons name="chevron-forward" size={17} color={COLORS.textFaint} /> : null}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} android_ripple={{ color: COLORS.field }}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  pillText: { fontSize: 11, fontFamily: FONT.medium, fontWeight: '600' },
  statTile: {
    flex: 1,
    minWidth: 0,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: 14,
    gap: 6,
    ...SHADOW.card,
  },
  statTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  statLabel: { flex: 1, fontSize: 13, color: COLORS.textMuted, fontFamily: FONT.regular },
  statValue: { fontSize: 26, fontFamily: FONT.bold, fontWeight: '700', letterSpacing: -0.6 },
  statBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  statSub: { flex: 1, fontSize: 11.5, color: COLORS.textMuted, fontFamily: FONT.regular },
  quickCompact: {
    flex: 1,
    minWidth: 0,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 12,
    gap: 8,
    minHeight: 104,
    ...SHADOW.card,
  },
  quickWide: {
    flex: 1,
    minWidth: 0,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 14,
    gap: 6,
    ...SHADOW.card,
  },
  quickTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  quickTitle: { fontSize: 14.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  quickTitleCompact: { fontSize: 12.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  quickSub: { fontSize: 11.5, color: COLORS.textMuted, fontFamily: FONT.regular, lineHeight: 15 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.danger, marginTop: 4 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionTitle: {
    fontSize: 18,
    fontFamily: FONT.medium,
    fontWeight: '600',
    color: COLORS.text,
    letterSpacing: -0.2,
  },
  sectionSub: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 2, fontFamily: FONT.regular },
  sectionAction: { fontSize: 13, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.primary },
  panel: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    ...SHADOW.card,
  },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  listRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.field },
  listTitle: { fontSize: 14.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  listSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2, fontFamily: FONT.regular },
  listRight: { fontSize: 11.5, color: COLORS.textFaint, fontFamily: FONT.regular },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
