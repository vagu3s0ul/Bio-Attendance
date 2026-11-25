/**
 * Ledger verification sheet — what "Verify Ledger" opens on the principal's
 * home. It is the proof the principal signs off on at the morning cutoff:
 *
 *   • how many classes are sealed (X of N) and which ones are still pending,
 *   • today's present / absent head-count,
 *   • a verification stamp carrying the date and the time it was checked.
 *
 * Pure presentation: the counts come from the home screen's live roster, so
 * opening the sheet never needs another request.
 */
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, FONT, LABEL_CAPS, RADIUS, SPACING } from '@/constants/theme';
import type { ClassStatus } from '@/types';

const SEALED_STATUSES = new Set(['done', 'sealed', 'stamped', 'complete', 'completed']);

/** "Done" / "Sealed" count as sealed; "Late" or "Partial" do not. */
export function isSealed(status: string): boolean {
  return SEALED_STATUSES.has((status || '').trim().toLowerCase());
}

function clockLabel(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function dateLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
}

export default function VerifyLedgerSheet({
  visible,
  roster,
  totalStudents,
  presentTotal,
  absentTotal,
  deadline,
  onClose,
}: {
  visible: boolean;
  roster: ClassStatus[];
  totalStudents: number;
  presentTotal: number;
  absentTotal: number;
  deadline?: string;
  onClose: () => void;
}) {
  // The stamp is the moment the principal opened the sheet — frozen while it
  // stays open, so the time on the stamp matches what they verified.
  const [opened, setOpened] = useState(() => new Date());

  const classTotal = roster.length;
  const sealedCount = roster.filter((c) => isSealed(c.status)).length;
  const pending = roster.filter((c) => !isSealed(c.status));
  const pct = classTotal > 0 ? Math.round((sealedCount / classTotal) * 100) : 0;
  const presentPct = totalStudents > 0 ? Math.round((presentTotal / totalStudents) * 100) : 0;

  const open = () => setOpened(new Date());

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onShow={open}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <View style={styles.grabber} />

          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="shield-checkmark" size={18} color={COLORS.primary} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.title}>Ledger Verification</Text>
              <Text style={styles.sub} numberOfLines={1}>
                {dateLabel(opened)}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
              <Ionicons name="close" size={18} color={COLORS.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
            {/* Verified stamp */}
            <View style={styles.stamp}>
              <View style={styles.stampSeal}>
                <Ionicons name="checkmark" size={20} color={COLORS.success} />
              </View>
              <Text style={styles.stampTitle}>VERIFIED</Text>
              <Text style={styles.stampTime}>Stamped {clockLabel(opened)}</Text>
              <Text style={styles.stampMeta}>
                {sealedCount === classTotal && classTotal > 0
                  ? 'All classes sealed for today'
                  : `${pending.length} class${pending.length === 1 ? '' : 'es'} still pending`}
              </Text>
            </View>

            {/* Sealed progress */}
            <View style={styles.block}>
              <View style={styles.blockHead}>
                <Text style={styles.blockLabel}>CLASSES SEALED</Text>
                <Text style={styles.blockValue}>
                  {sealedCount}
                  <Text style={styles.blockOf}> / {classTotal}</Text>
                </Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.min(pct, 100)}%` }]} />
              </View>
              <Text style={styles.blockNote}>
                {deadline ? `Morning cutoff ${deadline} • ` : ''}
                {pct}% of the roster locked
              </Text>
            </View>

            {/* Pending classes */}
            <View style={styles.block}>
              <Text style={styles.blockLabel}>
                {pending.length > 0 ? 'STILL PENDING' : 'PENDING CLASSES'}
              </Text>
              {pending.length === 0 ? (
                <View style={styles.allClear}>
                  <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
                  <Text style={styles.allClearText}>Every class has been sealed.</Text>
                </View>
              ) : (
                <View style={styles.chips}>
                  {pending.slice(0, 12).map((c) => (
                    <View key={c.className} style={styles.chip}>
                      <Text style={styles.chipText} numberOfLines={1}>
                        {c.className}
                      </Text>
                    </View>
                  ))}
                  {pending.length > 12 ? (
                    <View style={[styles.chip, styles.chipMore]}>
                      <Text style={styles.chipMoreText}>+{pending.length - 12} more</Text>
                    </View>
                  ) : null}
                </View>
              )}
            </View>

            {/* Today's head-count */}
            <View style={styles.statRow}>
              <View style={[styles.stat, { backgroundColor: COLORS.successSoft }]}>
                <Text style={[styles.statValue, { color: COLORS.success }]}>
                  {presentTotal.toLocaleString()}
                </Text>
                <Text style={styles.statLabel}>Present today</Text>
                <Text style={styles.statMeta}>{presentPct}% of enrolled</Text>
              </View>
              <View style={[styles.stat, { backgroundColor: COLORS.dangerSoft }]}>
                <Text style={[styles.statValue, { color: COLORS.danger }]}>
                  {absentTotal.toLocaleString()}
                </Text>
                <Text style={styles.statLabel}>Absent today</Text>
                <Text style={styles.statMeta}>
                  {totalStudents > 0 ? 100 - presentPct : 0}% of enrolled
                </Text>
              </View>
            </View>

            <View style={styles.signed}>
              <Ionicons name="lock-closed-outline" size={13} color={COLORS.textMuted} />
              <Text style={styles.signedText}>
                Sealed entries are read-only. Late corrections need secretariat sign-off.
              </Text>
            </View>
          </ScrollView>

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.doneBtn, pressed && styles.pressed]}
          >
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.lg,
    maxHeight: '88%',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.surfaceHigh,
    marginBottom: SPACING.md,
  },
  flex: { flex: 1 },
  pressed: { opacity: 0.9 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 15.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  sub: { fontSize: 11.5, color: COLORS.textMuted, fontFamily: FONT.regular, marginTop: 2 },
  close: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: COLORS.field,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scroll: { marginTop: SPACING.md, flexShrink: 1 },
  content: { gap: SPACING.md, paddingBottom: SPACING.sm },

  stamp: {
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: COLORS.success,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.mintSoft,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.md,
  },
  stampSeal: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  stampTitle: {
    fontSize: 15,
    fontFamily: FONT.bold,
    fontWeight: '700',
    color: COLORS.success,
    letterSpacing: 2.5,
  },
  stampTime: { fontSize: 12.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  stampMeta: { fontSize: 11, color: COLORS.textMuted, fontFamily: FONT.regular },

  block: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    gap: 8,
  },
  blockHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  blockLabel: { ...LABEL_CAPS, fontSize: 10.5 },
  blockValue: { fontSize: 20, fontFamily: FONT.display, fontWeight: '300', color: COLORS.text },
  blockOf: { fontSize: 13, color: COLORS.textFaint, fontFamily: FONT.regular },
  blockNote: { fontSize: 11, color: COLORS.textMuted, fontFamily: FONT.regular },
  track: { height: 6, borderRadius: 3, backgroundColor: COLORS.surfaceHigh, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3, backgroundColor: COLORS.success },

  allClear: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  allClearText: { fontSize: 12.5, color: COLORS.textMuted, fontFamily: FONT.regular },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    backgroundColor: COLORS.warningBg,
    borderRadius: RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: 150,
  },
  chipText: { fontSize: 11.5, color: COLORS.warningText, fontFamily: FONT.medium, fontWeight: '600' },
  chipMore: { backgroundColor: COLORS.field },
  chipMoreText: { fontSize: 11.5, color: COLORS.textMuted, fontFamily: FONT.medium, fontWeight: '600' },

  statRow: { flexDirection: 'row', gap: SPACING.md },
  stat: { flex: 1, borderRadius: RADIUS.lg, padding: SPACING.md, gap: 2 },
  statValue: { fontSize: 22, fontFamily: FONT.display, fontWeight: '300' },
  statLabel: { fontSize: 12, color: COLORS.text, fontFamily: FONT.medium, fontWeight: '600' },
  statMeta: { fontSize: 10.5, color: COLORS.textMuted, fontFamily: FONT.regular },

  signed: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: 2 },
  signedText: { flex: 1, fontSize: 10.5, color: COLORS.textMuted, fontFamily: FONT.regular, lineHeight: 15 },

  doneBtn: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 13,
    alignItems: 'center',
  },
  doneText: { fontSize: 13.5, fontFamily: FONT.medium, fontWeight: '600', color: '#fff' },
});
