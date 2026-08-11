import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import Screen from '@/components/Screen';
import Card from '@/components/Card';
import { COLORS, FONT, LABEL_CAPS, RADIUS, SPACING } from '@/constants/theme';
import { fetchEntry, submitEntry } from '@/services/api';
import { getAbsentRolls, setAbsentRolls } from '@/services/attendance';
import { CheckpointKey, EntryFormData, CHECKPOINTS, todayISO } from '@/services/extract';
import { useSession } from '@/store/session';
import { SessionExpiredError } from '@/types';
import WhatsAppNumberModal from '@/components/WhatsAppNumberModal';

type ChipState = 'neutral' | 'compliant' | 'non';
type Attendance = 'present' | 'absent';

interface ChipRef {
  name: string;
  value: string;
}

interface StudentState {
  roll: string;
  name: string;
  chips: Record<CheckpointKey, ChipState>;
  refs: Record<CheckpointKey, ChipRef>;
  remarks: { name: string; value: string } | null;
  attendance: Attendance;
}

// Flat, clean emoji icons — matches the approved daily-entry design (light
// chips, icon above label). Emojis render crisply at any size on Android.
const CHIP_META: Record<CheckpointKey, { label: string; emoji: string }> = {
  uniform: { label: 'Uniform', emoji: '👕' },
  shoes: { label: 'Shoes', emoji: '👟' },
  socks: { label: 'Socks', emoji: '🧦' },
  haircut: { label: 'Haircut', emoji: '🙂' },
  nails: { label: 'Nails', emoji: '🖐️' },
  bag: { label: 'Bag', emoji: '🎒' },
};

function shiftDate(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + delta);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

function formatDateLabel(iso: string): string {
  const today = todayISO();
  const d = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  const base = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return today === iso ? `Today, ${base}` : base;
}

/** Cycle neutral → compliant → non → neutral (matches the design's chip UX). */
function nextChip(state: ChipState): ChipState {
  if (state === 'neutral') return 'compliant';
  if (state === 'compliant') return 'non';
  return 'neutral';
}

function ToggleChip({
  label,
  emoji,
  state,
  onPress,
}: {
  label: string;
  emoji: string;
  state: ChipState;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
    >
      {/* Light-gray chip in every state — the corner badge carries the state:
          green check = compliant, red cross = non-compliant, hidden = neutral. */}
      <View
        style={[
          styles.chipBadge,
          state === 'compliant' && styles.chipBadgeOk,
          state === 'non' && styles.chipBadgeNo,
        ]}
      >
        {state !== 'neutral' ? (
          <Ionicons
            name={state === 'compliant' ? 'checkmark' : 'close'}
            size={9}
            color="#fff"
          />
        ) : null}
      </View>
      <Text style={styles.chipEmoji}>{emoji}</Text>
      <Text
        style={[
          styles.chipLabel,
          state === 'compliant' && styles.chipLabelOk,
          state === 'non' && styles.chipLabelNo,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function EntryScreen() {
  const router = useRouter();
  const { signOut } = useSession();

  const [date, setDate] = useState(todayISO);
  const [meta, setMeta] = useState<Pick<EntryFormData, 'classLabel' | 'maxDate' | 'afterDeadline'> | null>(null);
  const [students, setStudents] = useState<StudentState[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [waModal, setWaModal] = useState<{ roll: string; name: string } | null>(null);

  // Keep in-progress edits across tab switches: a focus reload only happens
  // when nothing is dirty, and it re-fetches the currently-viewed date.
  const dateRef = useRef(date);
  const dirtyRef = useRef(false);

  const load = useCallback(
    async (target: string, silent = false) => {
      if (!silent) setLoading(true);
      try {
        const form = await fetchEntry(target);
        setDate(form.date || target);
        dateRef.current = form.date || target;
        dirtyRef.current = false;
        setMeta({
          classLabel: form.classLabel,
          maxDate: form.maxDate,
          afterDeadline: form.afterDeadline,
        });
        // Attendance now lives on the SERVER (is_absent). Keep the on-device
        // map as a fallback for pages that don't expose the Status column yet.
        const effectiveDate = form.date || target;
        const storedAbsent = new Set(await getAbsentRolls(form.classLabel, effectiveDate));
        setStudents(
          form.students.map((s) => {
            const chips = {} as Record<CheckpointKey, ChipState>;
            const refs = {} as Record<CheckpointKey, ChipRef>;
            for (const cb of s.checkboxes) {
              chips[cb.key] = cb.checked ? 'compliant' : 'neutral';
              refs[cb.key] = { name: cb.name, value: cb.value || 'on' };
            }
            return {
              roll: s.roll,
              name: s.name,
              chips,
              refs,
              remarks: s.remarks,
              attendance:
                s.absent === null
                  ? storedAbsent.has(s.roll)
                    ? 'absent'
                    : 'present'
                  : s.absent
                  ? 'absent'
                  : 'present',
            };
          })
        );
      } catch (e: any) {
        if (e instanceof SessionExpiredError) {
          Alert.alert('Session expired', 'Please log in again.');
          await signOut();
          router.replace('/(auth)/login');
          return;
        }
        Alert.alert("Couldn't load entry", e?.message || 'Check your connection.');
      } finally {
        setLoading(false);
      }
    },
    [signOut]
  );

  useFocusEffect(
    useCallback(() => {
      // Don't clobber in-progress edits; otherwise refresh the current date.
      if (!dirtyRef.current) load(dateRef.current);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load])
  );

  const toggle = useCallback((si: number, key: CheckpointKey) => {
    dirtyRef.current = true;
    setStudents((prev) =>
      prev.map((s, i) => {
        if (i !== si) return s;
        return { ...s, chips: { ...s.chips, [key]: nextChip(s.chips[key]) } };
      })
    );
  }, []);

  const setRemarks = useCallback((si: number, text: string) => {
    dirtyRef.current = true;
    setStudents((prev) =>
      prev.map((s, i) =>
        i !== si ? s : { ...s, remarks: s.remarks ? { ...s.remarks, value: text } : null }
      )
    );
  }, []);

  const setAttendance = useCallback((si: number, mode: Attendance) => {
    dirtyRef.current = true;
    setStudents((prev) =>
      prev.map((s, i) => (i !== si ? s : { ...s, attendance: mode }))
    );
  }, []);

  const markAll = useCallback(() => {
    dirtyRef.current = true;
    setStudents((prev) =>
      prev.map((s) => {
        const chips = {} as Record<CheckpointKey, ChipState>;
        for (const k of CHECKPOINTS) chips[k] = 'compliant';
        return { ...s, chips };
      })
    );
  }, []);

  const markedCount = useMemo(
    () =>
      students.filter(
        (s) => s.attendance === 'present' && CHECKPOINTS.some((k) => s.chips[k] !== 'neutral')
      ).length,
    [students]
  );
  const progress = students.length > 0 ? Math.round((markedCount / students.length) * 100) : 0;

  const save = useCallback(async () => {
    if (students.length === 0) return;
    setSaving(true);
    const fields: Record<string, string> = { record_date: date };
    for (const s of students) {
      // Attendance is posted for EVERY student (1 = absent, 0 = present) so a
      // stale absent mark from a previous day is always cleared server-side.
      fields[`records[${s.roll}][is_absent]`] = s.attendance === 'absent' ? '1' : '0';
      // Absent students have no grooming data — skip the checkboxes/remarks.
      if (s.attendance === 'absent') continue;
      for (const k of CHECKPOINTS) {
        if (s.chips[k] === 'compliant') {
          const ref = s.refs[k];
          if (ref) fields[ref.name] = ref.value;
        }
      }
      if (s.remarks) fields[s.remarks.name] = s.remarks.value;
    }
    try {
      const res = await submitEntry(fields);
      if (res.ok) {
        const className = meta?.classLabel || '';
        // Non-compliant candidates (any checkpoint NOT marked compliant —
        // neutral or red both count) from PRESENT students only.
        const failed = students
          .filter((s) => s.attendance === 'present')
          .map((s) => ({
            roll: s.roll,
            name: s.name,
            failed: CHECKPOINTS.filter((k) => s.chips[k] !== 'compliant'),
          }))
          .filter((c) => c.failed.length > 0);
        // Absent students get their own WhatsApp alert.
        const absent = students
          .filter((s) => s.attendance === 'absent')
          .map((s) => ({ roll: s.roll, name: s.name }));
        // Persist absent marks on-device so they survive the reload below.
        try {
          await setAbsentRolls(className, date, absent.map((a) => a.roll));
        } catch {
          // non-fatal
        }
        if (failed.length > 0 || absent.length > 0) {
          try {
            router.push({
              pathname: '/notify',
              params: {
                date,
                className,
                students: JSON.stringify(failed),
                absent: JSON.stringify(absent),
              },
            });
          } catch {
            // Navigation can't fail hard on native, but never let a routing
            // hiccup take down the save flow.
            Alert.alert('Saved', res.message);
          }
        } else {
          Alert.alert('Saved', res.message);
        }
        load(date, true);
      } else {
        Alert.alert('Not saved', res.message);
      }
    } catch (e: any) {
      if (e instanceof SessionExpiredError) {
        Alert.alert('Session expired', 'Please log in again.');
        await signOut();
        router.replace('/(auth)/login');
        return;
      }
      Alert.alert('Not saved', e?.message || 'Could not reach the server.');
    } finally {
      setSaving(false);
    }
  }, [date, students, load, signOut, meta]);

  const canGoNext = !meta?.maxDate || date < meta.maxDate;

  return (
    <Screen edges={[]}>
      {/* Sticky date / mark-all bar */}
      <View style={styles.actionBar}>
        <View style={styles.dateGroup}>
          <Pressable
            style={styles.dateArrow}
            onPress={() => load(shiftDate(date, -1), true)}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={18} color={COLORS.primary} />
          </Pressable>
          <View>
            <Text style={[styles.dateLabel, LABEL_CAPS]}>Date</Text>
            <Text style={styles.dateValue}>{formatDateLabel(date)}</Text>
          </View>
          <Pressable
            style={[styles.dateArrow, !canGoNext && styles.dateArrowDisabled]}
            onPress={() => canGoNext && load(shiftDate(date, 1), true)}
            hitSlop={8}
            disabled={!canGoNext}
          >
            <Ionicons name="chevron-forward" size={18} color={COLORS.primary} />
          </Pressable>
        </View>
        <Pressable
          style={({ pressed }) => [styles.markAllBtn, pressed && styles.pressedBtn]}
          onPress={markAll}
        >
          <Ionicons name="checkmark-done" size={16} color={COLORS.primary} />
          <Text style={styles.markAllText}>Mark All Compliant</Text>
        </Pressable>
      </View>

      {meta?.afterDeadline ? (
        <View style={styles.lateBanner}>
          <Ionicons name="warning" size={16} color="#B28200" />
          <Text style={styles.lateText}>You are entering data after the deadline.</Text>
        </View>
      ) : null}

      {loading && students.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.centerText}>Loading your class…</Text>
        </View>
      ) : students.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="people-outline" size={26} color={COLORS.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No student list here</Text>
          <Text style={styles.emptyBody}>
            Your account isn't bound to a class ({meta?.classLabel || 'Class: ALL'}). Open the full
            web page to manage records.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressedBtn]}
            onPress={() => router.push('/web/entry')}
          >
            <Text style={styles.primaryBtnText}>Open full web page</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
            {students.map((s, si) => (
              <Card key={`${s.roll}-${si}`} style={styles.studentCard}>
                <View style={styles.studentHead}>
                  <View style={styles.studentHeadText}>
                    <Text style={styles.roll}>{s.roll || String(si + 1).padStart(2, '0')}</Text>
                    <Text style={styles.studentName}>{s.name}</Text>
                  </View>
                  <Pressable
                    style={({ pressed }) => [styles.waShortcut, pressed && styles.pressedBtn]}
                    onPress={() => setWaModal({ roll: s.roll, name: s.name })}
                    hitSlop={6}
                  >
                    <Ionicons name="logo-whatsapp" size={15} color={COLORS.compliant} />
                    <Text style={styles.waShortcutText}>Number</Text>
                  </Pressable>
                </View>
                <View style={styles.attRow}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.attPill,
                      s.attendance === 'present' && styles.attPillOn,
                      pressed && styles.pressedBtn,
                    ]}
                    onPress={() => setAttendance(si, 'present')}
                    hitSlop={4}
                  >
                    <Ionicons
                      name="checkmark-circle"
                      size={14}
                      color={s.attendance === 'present' ? '#fff' : COLORS.compliant}
                    />
                    <Text
                      style={[
                        styles.attPillText,
                        s.attendance === 'present' && styles.attPillTextOn,
                      ]}
                    >
                      Present
                    </Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.attPill,
                      s.attendance === 'absent' && styles.attPillAbsOn,
                      pressed && styles.pressedBtn,
                    ]}
                    onPress={() => setAttendance(si, 'absent')}
                    hitSlop={4}
                  >
                    <Ionicons
                      name="close-circle"
                      size={14}
                      color={s.attendance === 'absent' ? '#fff' : COLORS.danger}
                    />
                    <Text
                      style={[
                        styles.attPillText,
                        s.attendance === 'absent' && styles.attPillTextOn,
                      ]}
                    >
                      Absent
                    </Text>
                  </Pressable>
                </View>
                <View style={[styles.chipRow, s.attendance === 'absent' && styles.chipsDisabled]}>
                  {CHECKPOINTS.map((k) => (
                    <ToggleChip
                      key={k}
                      label={CHIP_META[k].label}
                      emoji={CHIP_META[k].emoji}
                      state={s.chips[k]}
                      onPress={() => s.attendance === 'present' && toggle(si, k)}
                    />
                  ))}
                </View>
                <TextInput
                  style={[styles.remarks, s.attendance === 'absent' && styles.chipsDisabled]}
                  value={s.remarks?.value ?? ''}
                  onChangeText={(t) => s.attendance === 'present' && setRemarks(si, t)}
                  placeholder="Add remarks…"
                  placeholderTextColor={COLORS.textFaint}
                  editable={s.attendance === 'present'}
                />
              </Card>
            ))}
            <Text style={styles.endText}>End of List</Text>
          </ScrollView>

          {waModal ? (
            <WhatsAppNumberModal
              visible
              className={meta?.classLabel || ''}
              roll={waModal.roll}
              studentName={waModal.name}
              onClose={() => setWaModal(null)}
              onSaved={() => setWaModal(null)}
            />
          ) : null}

          {/* Fixed save area */}
          <View style={styles.saveArea}>
            <View style={styles.progressRow}>
              <Text style={[styles.progressLabel, LABEL_CAPS]}>Progress</Text>
              <Text style={[styles.progressCount, LABEL_CAPS]}>
                {markedCount} of {students.length} marked
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
            <Pressable
              style={({ pressed }) => [styles.saveBtn, pressed && styles.pressedBtn, saving && styles.saveBtnBusy]}
              onPress={save}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="save-outline" size={18} color="#fff" />
                  <Text style={styles.saveBtnText}>Save Entries</Text>
                </>
              )}
            </Pressable>
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outline,
    backgroundColor: COLORS.background,
  },
  dateGroup: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dateArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateArrowDisabled: { opacity: 0.3 },
  dateLabel: { color: COLORS.textMuted },
  dateValue: {
    fontSize: 16,
    fontFamily: FONT.medium,
    fontWeight: '600',
    color: COLORS.primary,
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surface,
  },
  markAllText: {
    fontSize: 13,
    fontFamily: FONT.medium,
    fontWeight: '600',
    color: COLORS.primary,
  },
  lateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.warningBg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 8,
  },
  lateText: { fontSize: 12, color: COLORS.warningText, fontFamily: FONT.regular, flex: 1 },
  scroll: { flex: 1 },
  list: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 24 },
  studentCard: { gap: 10 },
  studentHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  studentHeadText: { flex: 1 },
  roll: { color: COLORS.textMuted, fontSize: 12, fontFamily: FONT.medium, fontWeight: '600', letterSpacing: 0.5 },
  studentName: { fontSize: 18, fontFamily: FONT.regular, fontWeight: '400', color: COLORS.text, marginTop: -4 },
  waShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.compliant,
    backgroundColor: COLORS.surface,
  },
  waShortcutText: { fontSize: 11.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.compliant },
  attRow: { flexDirection: 'row', gap: 6 },
  attPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minHeight: 30,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
  },
  attPillOn: {
    backgroundColor: COLORS.compliant,
    borderColor: COLORS.compliant,
  },
  attPillAbsOn: {
    backgroundColor: COLORS.danger,
    borderColor: COLORS.danger,
  },
  attPillText: {
    fontSize: 12,
    fontFamily: FONT.medium,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  attPillTextOn: { color: '#fff' },
  chipsDisabled: { opacity: 0.4 },
  chipRow: { flexDirection: 'row', gap: 6 },
  chip: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.neutralChip,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 7,
    paddingHorizontal: 4,
  },
  chipPressed: { transform: [{ scale: 0.94 }] },
  chipEmoji: { fontSize: 18, lineHeight: 22 },
  chipLabel: { fontSize: 11, color: COLORS.neutralChipText, fontFamily: FONT.regular },
  chipLabelOk: { color: COLORS.compliant, fontFamily: FONT.medium, fontWeight: '600' },
  chipLabelNo: { color: COLORS.danger, fontFamily: FONT.medium, fontWeight: '600' },
  chipBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.surfaceHigh,
    borderWidth: 1,
    borderColor: COLORS.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipBadgeOk: { backgroundColor: COLORS.compliant, borderColor: COLORS.compliant },
  chipBadgeNo: { backgroundColor: COLORS.danger, borderColor: COLORS.danger },
  remarks: {
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceLow,
    paddingHorizontal: 12,
    fontSize: 13,
    color: COLORS.text,
    fontFamily: FONT.regular,
  },
  endText: {
    textAlign: 'center',
    fontSize: 11,
    color: COLORS.textFaint,
    fontFamily: FONT.regular,
    marginTop: 4,
  },
  saveArea: {
    padding: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.outline,
    backgroundColor: COLORS.surface,
    gap: 8,
  },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { color: COLORS.textMuted },
  progressCount: { color: COLORS.primary },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: COLORS.surfaceHigh, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2, backgroundColor: COLORS.primary },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    marginTop: 2,
  },
  saveBtnBusy: { opacity: 0.7 },
  saveBtnText: { color: '#fff', fontSize: 14, fontFamily: FONT.medium, fontWeight: '600' },
  pressedBtn: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  centerText: { fontSize: 13, color: COLORS.textMuted, marginTop: 8, fontFamily: FONT.regular },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: { fontSize: 17, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  emptyBody: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 19,
    fontFamily: FONT.regular,
  },
  primaryBtn: {
    marginTop: 12,
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 14, fontFamily: FONT.medium, fontWeight: '600' },
});
