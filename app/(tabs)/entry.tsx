import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import AppBar from '@/components/AppBar';
import { IconTile, Panel, Pill } from '@/components/UI';
import { COLORS, FONT, RADIUS, SHADOW, SPACING } from '@/constants/theme';
import { fetchEntry, submitEntry } from '@/services/api';
import { setAbsentRolls } from '@/services/attendance';
import { CheckpointKey, EntryFormData, CHECKPOINTS, todayISO } from '@/services/domain';
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

const CHIP_META: Record<CheckpointKey, { label: string; emoji: string }> = {
  uniform: { label: 'Uniform', emoji: '👕' },
  shoes: { label: 'Shoes', emoji: '👟' },
  socks: { label: 'Socks', emoji: '🧦' },
  haircut: { label: 'Haircut', emoji: '🙂' },
  nails: { label: 'Nails', emoji: '🖐️' },
  bag: { label: 'School Bag', emoji: '🎒' },
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

function nextChip(state: ChipState): ChipState {
  if (state === 'neutral') return 'compliant';
  if (state === 'compliant') return 'non';
  return 'neutral';
}

/** Checklist row: square checkbox + label, cycles neutral → ok → flagged. */
function CheckRow({
  label,
  emoji,
  state,
  disabled,
  onPress,
}: {
  label: string;
  emoji: string;
  state: ChipState;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.checkRow, pressed && !disabled && styles.pressedSoft]}
    >
      <View
        style={[
          styles.checkBox,
          state === 'compliant' && styles.checkBoxOk,
          state === 'non' && styles.checkBoxNo,
        ]}
      >
        {state === 'compliant' ? (
          <Ionicons name="checkmark" size={12} color="#fff" />
        ) : state === 'non' ? (
          <Ionicons name="close" size={12} color="#fff" />
        ) : null}
      </View>
      <Text style={styles.checkEmoji}>{emoji}</Text>
      <Text
        style={[
          styles.checkLabel,
          state === 'compliant' && styles.checkLabelOk,
          state === 'non' && styles.checkLabelNo,
        ]}
        numberOfLines={1}
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
        // Default attendance is ABSENT: a student is only Present after their
        // face attendance was verified (or the teacher taps Present).
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
              attendance: s.absent ? 'absent' : 'present',
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
    setStudents((prev) => prev.map((s, i) => (i !== si ? s : { ...s, attendance: mode })));
  }, []);

  const markAllUniform = useCallback(() => {
    dirtyRef.current = true;
    setStudents((prev) =>
      prev.map((s) => ({ ...s, chips: { ...s.chips, uniform: 'compliant' as ChipState } }))
    );
  }, []);

  const clearAll = useCallback(() => {
    dirtyRef.current = true;
    setStudents((prev) =>
      prev.map((s) => {
        const chips = {} as Record<CheckpointKey, ChipState>;
        for (const k of CHECKPOINTS) chips[k] = 'neutral';
        return { ...s, chips, attendance: 'absent' as Attendance };
      })
    );
  }, []);

  const presentCount = useMemo(
    () => students.filter((s) => s.attendance === 'present').length,
    [students]
  );
  const absentCount = students.length - presentCount;
  const markedCount = useMemo(
    () =>
      students.filter(
        (s) => s.attendance === 'present' && CHECKPOINTS.some((k) => s.chips[k] !== 'neutral')
      ).length,
    [students]
  );
  const pendingCount = Math.max(students.length - markedCount - absentCount, 0);
  const progress = students.length > 0 ? Math.round((presentCount / students.length) * 100) : 0;

  const save = useCallback(async () => {
    if (students.length === 0) return;
    setSaving(true);
    const fields: Record<string, string> = { record_date: date };
    for (const s of students) {
      fields[`records[${s.roll}][is_absent]`] = s.attendance === 'absent' ? '1' : '0';
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
        const failed = students
          .filter((s) => s.attendance === 'present')
          .map((s) => ({
            roll: s.roll,
            name: s.name,
            failed: CHECKPOINTS.filter((k) => s.chips[k] !== 'compliant'),
          }))
          .filter((c) => c.failed.length > 0);
        const absent = students
          .filter((s) => s.attendance === 'absent')
          .map((s) => ({ roll: s.roll, name: s.name }));
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
    <Screen>
      <AppBar />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Target class + session date */}
        <Panel style={styles.targetPanel}>
          <View style={styles.targetRow}>
            <View style={styles.flex}>
              <Text style={styles.fieldLabel}>Target Class</Text>
              <View style={styles.fieldWell}>
                <IconTile icon="school-outline" tone="lavender" size={30} radius={9} iconSize={15} />
                <Text style={styles.fieldValue} numberOfLines={1}>
                  {meta?.classLabel || 'All classes'}
                </Text>
              </View>
            </View>
            <View style={styles.flex}>
              <Text style={styles.fieldLabel}>Session Date</Text>
              <View style={styles.fieldWell}>
                <IconTile icon="calendar-outline" tone="sky" size={30} radius={9} iconSize={15} />
                <Text style={styles.fieldValue} numberOfLines={1}>
                  {formatDateLabel(date)}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.metaRow}>
            <Pill
              label={meta?.afterDeadline ? 'Late Entry' : 'Attendance Entry'}
              tone={meta?.afterDeadline ? 'rose' : 'lavender'}
              icon="time-outline"
            />
            <Pressable
              onPress={() => load(shiftDate(date, -1), true)}
              hitSlop={8}
              style={styles.stepBtn}
            >
              <Ionicons name="chevron-back" size={16} color={COLORS.primary} />
            </Pressable>
            <Pressable
              onPress={() => canGoNext && load(shiftDate(date, 1), true)}
              disabled={!canGoNext}
              hitSlop={8}
              style={[styles.stepBtn, !canGoNext && styles.stepBtnOff]}
            >
              <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
            </Pressable>
          </View>

          {meta?.afterDeadline ? (
            <View style={styles.lateBanner}>
              <Ionicons name="warning" size={15} color={COLORS.warningText} />
              <Text style={styles.lateText}>You are entering data after the deadline.</Text>
            </View>
          ) : null}
        </Panel>

        {/* Completion */}
        <Panel style={styles.progressPanel}>
          <View style={styles.progressHead}>
            <View style={styles.flex}>
              <Text style={styles.progressTitle}>
                Marked {presentCount}/{students.length} Students
              </Text>
              <Text style={styles.progressSub}>
                Class roster completion: {progress}%
              </Text>
            </View>
            <View style={styles.ring}>
              <Text style={styles.ringText}>{progress}%</Text>
            </View>
          </View>

          <View style={styles.track}>
            <View style={[styles.trackPresent, { flex: Math.max(presentCount, 0.001) }]} />
            <View style={[styles.trackAbsent, { flex: Math.max(absentCount, 0.001) }]} />
          </View>

          <View style={styles.countersRow}>
            <View style={styles.counter}>
              <View style={[styles.dot, { backgroundColor: COLORS.primary }]} />
              <Text style={styles.counterLabel}>Present</Text>
              <Text style={styles.counterValue}>{presentCount}</Text>
            </View>
            <View style={styles.counter}>
              <View style={[styles.dot, { backgroundColor: COLORS.danger }]} />
              <Text style={styles.counterLabel}>Absent</Text>
              <Text style={styles.counterValue}>{absentCount}</Text>
            </View>
            <View style={styles.counter}>
              <View style={[styles.dot, { backgroundColor: COLORS.textFaint }]} />
              <Text style={styles.counterLabel}>Pending</Text>
              <Text style={styles.counterValue}>{pendingCount}</Text>
            </View>
          </View>

          <View style={styles.actionRow}>
            <Pressable
              onPress={markAllUniform}
              style={({ pressed }) => [styles.softAction, pressed && styles.pressedSoft]}
            >
              <Ionicons name="checkmark-done" size={16} color={COLORS.primary} />
              <Text style={styles.softActionText}>Mark All Uniform</Text>
            </Pressable>
            <Pressable
              onPress={clearAll}
              style={({ pressed }) => [styles.ghostAction, pressed && styles.pressedSoft]}
            >
              <Ionicons name="refresh-outline" size={16} color={COLORS.textMuted} />
              <Text style={styles.ghostActionText}>Clear All</Text>
            </Pressable>
          </View>
        </Panel>

        {/* Roster header */}
        <View style={styles.rosterHead}>
          <Text style={styles.rosterTitle}>Student Roster</Text>
          <Pill label={`${students.length} Total`} tone="slate" />
          <View style={styles.flex} />
          <Ionicons name="options-outline" size={14} color={COLORS.textMuted} />
          <Text style={styles.rosterMeta}>Roll No Order</Text>
        </View>

        {loading && students.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.centerText}>Loading your class…</Text>
          </View>
        ) : students.length === 0 ? (
          <Panel style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons name="people-outline" size={26} color={COLORS.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No student list here</Text>
            <Text style={styles.emptyBody}>
              Your account isn't bound to a class ({meta?.classLabel || 'Class: ALL'}). Open the full
              web page to manage records.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressedSoft]}
              onPress={() => router.push('/web/entry')}
            >
              <Text style={styles.primaryBtnText}>Open full web page</Text>
            </Pressable>
          </Panel>
        ) : (
          students.map((s, si) => {
            const flagged = CHECKPOINTS.some((k) => s.chips[k] === 'non');
            const inspected = CHECKPOINTS.every((k) => s.chips[k] === 'compliant');
            return (
              <Panel key={`${s.roll}-${si}`} style={styles.studentCard}>
                <View style={styles.studentTop}>
                  <View style={styles.avatarWrap}>
                    <View style={styles.avatar}>
                      <Ionicons name="person" size={20} color={COLORS.textMuted} />
                    </View>
                    <View style={styles.rollBadge}>
                      <Text style={styles.rollBadgeText} numberOfLines={1}>
                        {s.roll || si + 1}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.flex}>
                    <Text style={styles.studentName} numberOfLines={1}>
                      #{s.roll || si + 1} {s.name}
                    </Text>
                    <Text style={styles.studentMeta} numberOfLines={1}>
                      {s.attendance === 'present' ? 'Present today' : 'Marked absent'} •{' '}
                      {CHECKPOINTS.filter((k) => s.chips[k] === 'compliant').length}/
                      {CHECKPOINTS.length} checks
                    </Text>
                  </View>

                  {flagged ? (
                    <Pill label="Flagged" tone="rose" icon="alert-circle-outline" />
                  ) : inspected ? (
                    <Pill label="Inspected" tone="sky" icon="checkmark-circle-outline" />
                  ) : (
                    <Pill label="Active" tone="slate" icon="sync-outline" />
                  )}
                </View>

                <View style={styles.attRow}>
                  <Pressable
                    onPress={() => setAttendance(si, 'present')}
                    style={({ pressed }) => [
                      styles.attBtn,
                      s.attendance === 'present' && styles.attBtnPresent,
                      pressed && styles.pressedSoft,
                    ]}
                  >
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={s.attendance === 'present' ? '#fff' : COLORS.primary}
                    />
                    <Text
                      style={[
                        styles.attBtnText,
                        s.attendance === 'present' && styles.attBtnTextOn,
                      ]}
                    >
                      PRESENT
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setAttendance(si, 'absent')}
                    style={({ pressed }) => [
                      styles.attBtn,
                      s.attendance === 'absent' && styles.attBtnAbsent,
                      pressed && styles.pressedSoft,
                    ]}
                  >
                    <Ionicons
                      name="close-circle"
                      size={16}
                      color={s.attendance === 'absent' ? '#fff' : COLORS.danger}
                    />
                    <Text
                      style={[
                        styles.attBtnText,
                        s.attendance === 'absent' && styles.attBtnTextOn,
                      ]}
                    >
                      ABSENT
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setWaModal({ roll: s.roll, name: s.name })}
                    style={({ pressed }) => [styles.waBtn, pressed && styles.pressedSoft]}
                  >
                    <Ionicons name="logo-whatsapp" size={17} color={COLORS.success} />
                  </Pressable>
                </View>

                <View style={[styles.checklist, s.attendance === 'absent' && styles.disabled]}>
                  <View style={styles.checklistHead}>
                    <Ionicons name="list-outline" size={14} color={COLORS.textMuted} />
                    <Text style={styles.checklistTitle}>Morning Discipline &amp; Dress Code</Text>
                    {flagged ? (
                      <Pill
                        label={`${CHECKPOINTS.filter((k) => s.chips[k] === 'non').length} Issues`}
                        tone="rose"
                      />
                    ) : null}
                  </View>
                  <View style={styles.checkGrid}>
                    {CHECKPOINTS.map((k) => (
                      <View key={k} style={styles.checkCell}>
                        <CheckRow
                          label={CHIP_META[k].label}
                          emoji={CHIP_META[k].emoji}
                          state={s.chips[k]}
                          disabled={s.attendance === 'absent'}
                          onPress={() => s.attendance === 'present' && toggle(si, k)}
                        />
                      </View>
                    ))}
                  </View>
                </View>

                <View style={[styles.remarksWrap, s.attendance === 'absent' && styles.disabled]}>
                  <Ionicons name="chatbox-ellipses-outline" size={15} color={COLORS.textFaint} />
                  <TextInput
                    style={styles.remarks}
                    value={s.remarks?.value ?? ''}
                    onChangeText={(t) => s.attendance === 'present' && setRemarks(si, t)}
                    placeholder="Add observation remarks…"
                    placeholderTextColor={COLORS.textFaint}
                    editable={s.attendance === 'present'}
                  />
                </View>
              </Panel>
            );
          })
        )}

        {students.length > 0 ? <Text style={styles.endText}>End of List</Text> : null}
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

      {students.length > 0 ? (
        <View style={styles.saveDeck}>
          <IconTile icon="checkmark-done-circle-outline" tone="lavender" size={38} radius={12} iconSize={19} />
          <View style={styles.saveText}>
            <Text style={styles.saveLabel}>Status</Text>
            <Text style={styles.saveValue}>{presentCount} Marked</Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.saveBtn,
              pressed && styles.pressedSoft,
              saving && styles.busy,
            ]}
            onPress={save}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="save-outline" size={17} color="#fff" />
                <Text style={styles.saveBtnText}>Save Attendance Entry</Text>
              </>
            )}
          </Pressable>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: SPACING.lg, paddingBottom: 28, gap: SPACING.md },

  targetPanel: { gap: 12 },
  targetRow: { flexDirection: 'row', gap: 10 },
  fieldLabel: {
    fontSize: 11,
    letterSpacing: 0.6,
    fontFamily: FONT.medium,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  fieldWell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.field,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  fieldValue: { flex: 1, fontSize: 13, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: COLORS.field,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnOff: { opacity: 0.4 },
  lateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.warningBg,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  lateText: { fontSize: 12, color: COLORS.warningText, fontFamily: FONT.regular, flex: 1 },

  progressPanel: { gap: 12 },
  progressHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressTitle: {
    fontSize: 17,
    fontFamily: FONT.bold,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  progressSub: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 2, fontFamily: FONT.regular },
  ring: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 3,
    borderColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  ringText: { fontSize: 14, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.primary },
  track: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: COLORS.field,
    gap: 2,
  },
  trackPresent: { backgroundColor: COLORS.primary, borderRadius: 4 },
  trackAbsent: { backgroundColor: COLORS.danger, borderRadius: 4 },
  countersRow: { flexDirection: 'row', gap: 8 },
  counter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.field,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  counterLabel: { flex: 1, fontSize: 12.5, color: COLORS.textMuted, fontFamily: FONT.regular },
  counterValue: { fontSize: 14, fontFamily: FONT.bold, fontWeight: '700', color: COLORS.text },
  actionRow: { flexDirection: 'row', gap: 8 },
  softAction: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 46,
    borderRadius: 13,
    backgroundColor: COLORS.lavender,
  },
  softActionText: { fontSize: 13.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.primary },
  ghostAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 46,
    borderRadius: 13,
    backgroundColor: COLORS.field,
  },
  ghostActionText: { fontSize: 13.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.textMuted },

  rosterHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  rosterTitle: { fontSize: 17, fontFamily: FONT.bold, fontWeight: '700', color: COLORS.text },
  rosterMeta: { fontSize: 12, color: COLORS.textMuted, fontFamily: FONT.regular },

  studentCard: { gap: 12 },
  studentTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarWrap: { width: 46, height: 46 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.field,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rollBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 3,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  rollBadgeText: { fontSize: 9.5, fontFamily: FONT.bold, fontWeight: '700', color: '#fff' },
  studentName: { fontSize: 15.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  studentMeta: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 2, fontFamily: FONT.regular },

  attRow: { flexDirection: 'row', gap: 8 },
  attBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.field,
  },
  attBtnPresent: { backgroundColor: COLORS.primary },
  attBtnAbsent: { backgroundColor: COLORS.danger },
  attBtnText: {
    fontSize: 12,
    letterSpacing: 0.5,
    fontFamily: FONT.medium,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  attBtnTextOn: { color: '#fff' },
  waBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.mintSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  checklist: { backgroundColor: COLORS.field, borderRadius: 14, padding: 10, gap: 8 },
  checklistHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  checklistTitle: {
    flex: 1,
    fontSize: 12,
    fontFamily: FONT.medium,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  checkGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  checkCell: { width: '48%' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  checkBox: {
    width: 17,
    height: 17,
    borderRadius: 5,
    borderWidth: 1.4,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBoxOk: { backgroundColor: COLORS.compliant, borderColor: COLORS.compliant },
  checkBoxNo: { backgroundColor: COLORS.danger, borderColor: COLORS.danger },
  checkEmoji: { fontSize: 12 },
  checkLabel: { flex: 1, fontSize: 12.5, color: COLORS.text, fontFamily: FONT.regular },
  checkLabelOk: { color: COLORS.text, fontFamily: FONT.medium, fontWeight: '600' },
  checkLabelNo: { color: COLORS.danger, fontFamily: FONT.medium, fontWeight: '600' },
  disabled: { opacity: 0.45 },

  remarksWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 42,
    borderRadius: 12,
    backgroundColor: COLORS.field,
    paddingHorizontal: 12,
  },
  remarks: { flex: 1, fontSize: 13, color: COLORS.text, fontFamily: FONT.regular },

  endText: {
    textAlign: 'center',
    fontSize: 11,
    color: COLORS.textFaint,
    fontFamily: FONT.regular,
    marginTop: 2,
  },

  saveDeck: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.field,
  },
  saveText: { flex: 1 },
  saveLabel: { fontSize: 11, color: COLORS.textMuted, fontFamily: FONT.regular },
  saveValue: { fontSize: 15, fontFamily: FONT.bold, fontWeight: '700', color: COLORS.text },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    ...SHADOW.lifted,
  },
  saveBtnText: { color: '#fff', fontSize: 14, fontFamily: FONT.medium, fontWeight: '600' },

  center: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  centerText: { fontSize: 13, color: COLORS.textMuted, marginTop: 8, fontFamily: FONT.regular },
  emptyCard: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.field,
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
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 14, fontFamily: FONT.medium, fontWeight: '600' },
  pressedSoft: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  busy: { opacity: 0.7 },
});
