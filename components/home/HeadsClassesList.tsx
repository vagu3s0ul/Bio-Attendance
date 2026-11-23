/**
 * Heads' Classes list — every class in scope with today's entry status.
 * Tapping a class expands it inline to the students' present/absent status
 * for today (from the Attendance fetch shared by the shell — no refetch
 * per class).
 */
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, FONT, SPACING } from '@/constants/theme';
import { Panel, Pill } from '@/components/UI';
import type { ReportRow } from '@/services/domain';
import type { ClassStatus } from '@/types';

type StatusTone = 'mint' | 'peach' | 'rose' | 'slate';

function statusTone(status: string): { label: string; tone: StatusTone } {
  if (status === 'Done') return { label: '✓ Done', tone: 'mint' };
  if (status === 'Partial') return { label: 'Partial', tone: 'peach' };
  if (status === 'Late') return { label: 'Late', tone: 'peach' };
  if (status === 'Not Done') return { label: 'Not Done', tone: 'rose' };
  return { label: status || '—', tone: 'slate' };
}

function initials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

export default function HeadsClassesList({
  classes,
  rows,
  onBack,
}: {
  classes: ClassStatus[];
  rows: ReportRow[] | null;
  onBack: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const locked = useMemo(
    () => classes.filter((c) => c.students > 0 && c.entered >= c.students).length,
    [classes]
  );
  const pending = Math.max(classes.length - locked, 0);

  const toggle = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Back to overview"
        >
          <Ionicons name="chevron-back" size={18} color={COLORS.text} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title}>Classes — Today</Text>
          <Text style={styles.scope}>
            {classes.length} classes · {locked} locked · {pending} pending
          </Text>
        </View>
      </View>

      {classes.length === 0 ? (
        <View style={styles.stateBox}>
          <Text style={styles.stateText}>No class activity yet today.</Text>
        </View>
      ) : (
        <Panel style={styles.list}>
          {classes.map((c, i) => {
            const { label, tone } = statusTone(c.status);
            const open = expanded.has(c.className);
            const students = rows ? rows.filter((r) => r.className === c.className) : null;
            return (
              <View
                key={`${c.className}-${i}`}
                style={i < classes.length - 1 ? styles.itemBorder : undefined}
              >
                <Pressable
                  onPress={() => toggle(c.className)}
                  style={({ pressed }) => [styles.classRow, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`${c.className}, ${c.entered} of ${c.students} present`}
                >
                  <View style={styles.classAvatar}>
                    <Text style={styles.classAvatarText}>
                      {c.className.split('-')[0] || c.className}
                    </Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.className} numberOfLines={1}>
                      {c.className}
                    </Text>
                    <Text style={styles.classMeta} numberOfLines={1}>
                      {c.teacher || 'Class teacher'} · {c.entered}/{c.students} Present
                    </Text>
                  </View>
                  <Pill label={label} tone={tone} />
                  <Ionicons
                    name={open ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={COLORS.textFaint}
                  />
                </Pressable>
                {open ? (
                  <View style={styles.students}>
                    {rows === null ? (
                      <View style={styles.loadingRow}>
                        <ActivityIndicator size="small" color={COLORS.primary} />
                        <Text style={styles.stateText}>Loading attendance…</Text>
                      </View>
                    ) : students && students.length > 0 ? (
                      students.map((s, j) => (
                        <View
                          key={`${s.className}:${s.roll}`}
                          style={[styles.studentRow, j < students.length - 1 && styles.rowBorder]}
                        >
                          <View
                            style={[
                              styles.avatar,
                              s.absent ? styles.avatarAbsent : styles.avatarPresent,
                            ]}
                          >
                            <Text
                              style={[
                                styles.avatarText,
                                s.absent ? styles.avatarTextAbsent : styles.avatarTextPresent,
                              ]}
                            >
                              {initials(s.name)}
                            </Text>
                          </View>
                          <View style={styles.flex}>
                            <Text style={styles.studentName} numberOfLines={1}>
                              {s.name}
                            </Text>
                            <Text style={styles.studentMeta}>Roll #{s.roll}</Text>
                          </View>
                          <Pill label={s.absent ? 'Absent' : 'Present'} tone={s.absent ? 'rose' : 'mint'} />
                        </View>
                      ))
                    ) : (
                      <Text style={styles.stateText}>
                        No attendance recorded for this class today.
                      </Text>
                    )}
                  </View>
                ) : null}
              </View>
            );
          })}
        </Panel>
      )}
      <Text style={styles.hint}>Tap a class to see its students for today.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: SPACING.md },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },

  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 16, fontFamily: FONT.display, fontWeight: '300', color: COLORS.text },
  scope: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 2, fontFamily: FONT.regular },

  stateBox: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  stateText: { fontSize: 13, color: COLORS.textMuted, fontFamily: FONT.regular, textAlign: 'center' },
  hint: { fontSize: 11, color: COLORS.textFaint, fontFamily: FONT.regular, textAlign: 'center' },

  list: { paddingVertical: 4 },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.outline },
  classRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  classAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  classAvatarText: { fontSize: 14, fontFamily: FONT.display, fontWeight: '300', color: COLORS.primary },
  className: { fontSize: 13.5, fontFamily: FONT.regular, color: COLORS.text },
  classMeta: { fontSize: 11, color: COLORS.textMuted, marginTop: 1, fontFamily: FONT.regular },

  students: { paddingLeft: 50, paddingBottom: 8, gap: 0 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  studentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.outline },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarAbsent: { backgroundColor: COLORS.dangerSoft },
  avatarPresent: { backgroundColor: COLORS.successSoft },
  avatarText: { fontSize: 12, fontFamily: FONT.display, fontWeight: '300' },
  avatarTextAbsent: { color: COLORS.danger },
  avatarTextPresent: { color: COLORS.success },
  studentName: { fontSize: 13, fontFamily: FONT.regular, color: COLORS.text },
  studentMeta: { fontSize: 11, color: COLORS.textMuted, marginTop: 1, fontFamily: FONT.regular },
});
