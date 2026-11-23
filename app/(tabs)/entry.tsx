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
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import Screen from '@/components/Screen';
import AppBar from '@/components/AppBar';
import { IconTile, Panel, Pill } from '@/components/UI';
import { COLORS, FONT, RADIUS, SHADOW, SPACING } from '@/constants/theme';
import { fetchEntry, fetchProfile, submitEntry } from '@/services/api';
import { canMarkAttendance } from '@/services/location';
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
  /** True once the teacher has done something with this student in this
   *  session (or the record shows a decision from an earlier save). Fresh
   *  defaults — absent, all checks ticked — are NOT touched, so they never
   *  count toward "checked". */
  touched: boolean;
}

const CHIP_META: Record<CheckpointKey, { label: string }> = {
  uniform: { label: 'Uniform' },
  shoes: { label: 'Shoes' },
  socks: { label: 'Socks' },
  haircut: { label: 'Haircut' },
  nails: { label: 'Nails' },
  bag: { label: 'School Bag' },
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

/** Big check tile: large symbol + word. Taps cycle ✓ → ✗ → – → ✓. */
function CheckTile({
  label,
  state,
  disabled,
  onPress,
}: {
  label: string;
  state: ChipState;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.checkTile,
        state === 'compliant' && styles.checkTileOk,
        state === 'non' && styles.checkTileNo,
        disabled && styles.checkTileDisabled,
        pressed && !disabled && styles.pressedSoft,
      ]}
    >
      <Text
        style={[
          styles.checkSymbol,
          state === 'compliant' && styles.checkSymbolOk,
          state === 'non' && styles.checkSymbolNo,
        ]}
      >
        {state === 'compliant' ? '✓' : state === 'non' ? '✗' : '–'}
      </Text>
      <Text style={styles.checkTileLabel} numberOfLines={1}>
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
  const [deadline, setDeadline] = useState<string>('');
  const [guard, setGuard] = useState<{ ok: boolean; reason?: string; distance?: number } | null>(null);
  const [remarksOpen, setRemarksOpen] = useState<Record<string, boolean>>({});

  const dateRef = useRef(date);
  const dirtyRef = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const g = await canMarkAttendance(deadline);
      if (alive) setGuard(g);
    })();
    return () => {
      alive = false;
    };
  }, [deadline]);

  const load = useCallback(
    async (target: string, silent = false) => {
      if (!silent) setLoading(true);
      try {
        const form = await fetchEntry(target);
        setDate(form.date || target);
        // Keep the daily deadline fresh for the location/time guard.
        fetchProfile().then((p) => setDeadline(p.deadline || '')).catch(() => {});
        dateRef.current = form.date || target;
        dirtyRef.current = false;
        setMeta({
          classLabel: form.classLabel,
          maxDate: form.maxDate,
          afterDeadline: form.afterDeadline,
        });
        // Default attendance is ABSENT: a student is only Present after their
        // face attendance was verified (or the teacher taps Present). Checks
        // arrive ticked from the server on a fresh entry. Present students
        // whose checks all arrive undecided (e.g. face-marked — the server
        // never wrote their checks) are defaulted to ticked below.
        setStudents(
          form.students.map((s) => {
            const chips = {} as Record<CheckpointKey, ChipState>;
            const refs = {} as Record<CheckpointKey, ChipRef>;
            for (const cb of s.checkboxes) {
              chips[cb.key] = cb.checked ? 'compliant' : 'neutral';
              refs[cb.key] = { name: cb.name, value: cb.value || 'on' };
            }
            // 'neutral' only ever means "never decided" — a real issue is
            // 'non'. So a present student with every check undecided and no
            // remarks simply never had their checks written: tick them all
            // and let the teacher untick the ones with something missing.
            if (
              s.absent === false &&
              CHECKPOINTS.every((k) => chips[k] === 'neutral') &&
              (s.remarks?.value ?? '').length === 0
            ) {
              for (const k of CHECKPOINTS) chips[k] = 'compliant';
            }
            return {
              roll: s.roll,
              name: s.name,
              chips,
              refs,
              remarks: s.remarks,
              attendance: s.absent === false ? 'present' : 'absent',
              // Touched when the record already shows a decision: present,
              // a changed checkbox, or a remark. Untouched students sit on
              // the fresh defaults and must not count as checked.
              touched:
                s.absent === false ||
                s.checkboxes.some((cb) => !cb.checked) ||
                (s.remarks?.value ?? '').length > 0,
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
        return { ...s, chips: { ...s.chips, [key]: nextChip(s.chips[key]) }, touched: true };
      })
    );
  }, []);

  const setRemarks = useCallback((si: number, text: string) => {
    dirtyRef.current = true;
    setStudents((prev) =>
      prev.map((s, i) =>
        i !== si ? s : { ...s, remarks: s.remarks ? { ...s.remarks, value: text } : null, touched: true }
      )
    );
  }, []);

  const setAttendance = useCallback((si: number, mode: Attendance) => {
    dirtyRef.current = true;
    setStudents((prev) =>
      prev.map((s, i) => {
        if (i !== si) return s;
        // Flipping to present with every check still undecided ticks them
        // all — the teacher only unticks the ones with something missing.
        if (
          mode === 'present' &&
          CHECKPOINTS.every((k) => s.chips[k] === 'neutral') &&
          (s.remarks?.value ?? '').length === 0
        ) {
          const chips = {} as Record<CheckpointKey, ChipState>;
          for (const k of CHECKPOINTS) chips[k] = 'compliant';
          return { ...s, attendance: mode, chips, touched: true };
        }
        return { ...s, attendance: mode, touched: true };
      })
    );
  }, []);

  const markAllPresent = useCallback(() => {
    dirtyRef.current = true;
    setStudents((prev) =>
      prev.map((s) => {
        // Same default as flipping one student to present: undecided checks
        // tick themselves; the teacher only unticks real issues.
        if (
          CHECKPOINTS.every((k) => s.chips[k] === 'neutral') &&
          (s.remarks?.value ?? '').length === 0
        ) {
          const chips = {} as Record<CheckpointKey, ChipState>;
          for (const k of CHECKPOINTS) chips[k] = 'compliant';
          return { ...s, attendance: 'present' as Attendance, chips, touched: true };
        }
        return { ...s, attendance: 'present' as Attendance, touched: true };
      })
    );
  }, []);

  const markAllUniform = useCallback(() => {
    dirtyRef.current = true;
    setStudents((prev) =>
      prev.map((s) => ({
        ...s,
        chips: { ...s.chips, uniform: 'compliant' as ChipState },
        touched: s.attendance === 'present' ? true : s.touched,
      }))
    );
  }, []);

  const clearAll = useCallback(() => {
    Alert.alert(
      'Clear all marks?',
      'This resets every student to absent with all checks ticked.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            dirtyRef.current = true;
            setStudents((prev) =>
              prev.map((s) => {
                const chips = {} as Record<CheckpointKey, ChipState>;
                for (const k of CHECKPOINTS) chips[k] = 'compliant';
                return { ...s, chips, attendance: 'absent' as Attendance, touched: false };
              })
            );
          },
        },
      ]
    );
  }, []);

  const presentCount = useMemo(
    () => students.filter((s) => s.attendance === 'present').length,
    [students]
  );
  const absentCount = students.length - presentCount;
  // Honest progress: only students the teacher has actually dealt with —
  // present with every check decided, or explicitly marked absent. Tapping
  // Present alone, or leaving a student on the defaults, does not count.
  const checkedCount = useMemo(
    () =>
      students.filter(
        (s) =>
          s.touched &&
          (s.attendance === 'absent' || CHECKPOINTS.every((k) => s.chips[k] !== 'neutral'))
      ).length,
    [students]
  );
  const toCheckCount = Math.max(students.length - checkedCount, 0);
  const progress = students.length > 0 ? Math.round((checkedCount / students.length) * 100) : 0;

  const save = useCallback(async () => {
    if (students.length === 0) return;
    const guard = await canMarkAttendance(deadline);
    if (!guard.ok) {
      Alert.alert('Cannot mark attendance', guard.reason || 'Attendance is not allowed right now.');
      return;
    }
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
        const className = (meta?.classLabel || '').replace(/^Class:\s*/i, '').trim();
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
  }, [date, students, load, signOut, meta, deadline]);

  const canGoNext = !meta?.maxDate || date < meta.maxDate;
  const blocked = !!guard && !guard.ok;

  // Location status for the header pill + banner. The guard carries the
  // distance in metres when the phone is outside the campus geofence.
  const locState = !guard
    ? 'checking'
    : guard.ok
    ? 'onCampus'
    : guard.distance !== undefined
    ? 'outside'
    : 'blocked';
  const locDistance = guard?.distance !== undefined ? Math.round(guard.distance) : null;

  return (
    <Screen>
      <AppBar />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Location: pill top-right always; red banner only outside campus */}
        <View style={styles.locHead}>
          <Text style={styles.screenTitle}>Daily Entry</Text>
          <View style={styles.flex} />
          {locState === 'onCampus' ? (
            <Pill
              label={locDistance !== null ? `On campus · ${locDistance} m` : 'On campus'}
              tone="mint"
              icon="ellipse"
            />
          ) : locState === 'outside' ? (
            <Pill
              label={`Outside campus · ${locDistance} m`}
              tone="rose"
              icon="ellipse"
            />
          ) : locState === 'checking' ? (
            <Pill label="Checking location…" tone="slate" icon="ellipse" />
          ) : null}
        </View>
        {locState === 'outside' ? (
          <View style={styles.locBannerOutside}>
            <Text style={styles.locBannerTitle}>
              ● Outside campus · {locDistance} m from school
            </Text>
            <Text style={styles.locBannerNote}>
              Attendance cannot be marked outside the campus location.
            </Text>
          </View>
        ) : locState === 'blocked' ? (
          <View style={styles.locBannerOther}>
            <Ionicons name="lock-closed" size={16} color={COLORS.warningText} />
            <Text style={styles.locBannerOtherText} numberOfLines={2}>
              {guard?.reason || 'Attendance marking is not available right now.'}
            </Text>
          </View>
        ) : null}

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
                Checked {checkedCount}/{students.length} students
              </Text>
              <Text style={styles.progressSub}>
                Fully checked = all 6 checks done, or marked absent
              </Text>
            </View>
            <View style={styles.ring}>
              <Text style={styles.ringText}>{progress}%</Text>
            </View>
          </View>

          <View style={styles.track}>
            <View style={[styles.trackFill, { width: `${progress}%` }]} />
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
              <View style={[styles.dot, { backgroundColor: COLORS.warning }]} />
              <Text style={styles.counterLabel}>To check</Text>
              <Text style={styles.counterValue}>{toCheckCount}</Text>
            </View>
          </View>

          <View style={styles.actionRow}>
            <Pressable
              onPress={markAllPresent}
              disabled={blocked}
              style={({ pressed }) => [
                styles.primaryAction,
                pressed && !blocked && styles.pressedSoft,
                blocked && styles.actionDisabled,
              ]}
            >
              <Ionicons name="checkmark-done" size={16} color="#fff" />
              <Text style={styles.primaryActionText}>Mark All Present</Text>
            </Pressable>
            <Pressable
              onPress={markAllUniform}
              disabled={blocked}
              style={({ pressed }) => [
                styles.softAction,
                pressed && !blocked && styles.pressedSoft,
                blocked && styles.actionDisabled,
              ]}
            >
              <Ionicons name="checkmark-done" size={16} color={COLORS.primary} />
              <Text style={styles.softActionText}>Mark All Uniform</Text>
            </Pressable>
            <Pressable
              onPress={clearAll}
              disabled={blocked}
              style={({ pressed }) => [
                styles.ghostAction,
                pressed && !blocked && styles.pressedSoft,
                blocked && styles.actionDisabled,
              ]}
            >
              <Ionicons name="refresh-outline" size={16} color={COLORS.textMuted} />
              <Text style={styles.ghostActionText}>Clear All</Text>
            </Pressable>
          </View>
        </Panel>

        <Text style={styles.legend}>
          Checks start ticked. Tap a tile: ✓ OK → ✗ issue → – not checked
        </Text>

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
            const showRemarks = !!remarksOpen[s.roll] || (s.remarks?.value ?? '').length > 0;
            return (
              <Panel key={`${s.roll}-${si}`} style={[styles.studentCard, s.attendance === 'absent' && styles.absentCard]}>
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
                      {!s.touched
                        ? 'Absent by default · not marked yet'
                        : s.attendance === 'present'
                        ? `Present today · ${CHECKPOINTS.filter((k) => s.chips[k] === 'compliant').length}/${CHECKPOINTS.length} checks`
                        : 'Marked absent'}
                    </Text>
                  </View>

                  {!s.touched ? (
                    <Pill label="Not marked" tone="slate" icon="time-outline" />
                  ) : flagged ? (
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
                    disabled={blocked}
                    style={({ pressed }) => [
                      styles.attBtn,
                      s.attendance === 'present' && styles.attBtnPresent,
                      pressed && !blocked && styles.pressedSoft,
                      blocked && styles.disabledBtn,
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
                    disabled={blocked}
                    style={({ pressed }) => [
                      styles.attBtn,
                      s.attendance === 'absent' && styles.attBtnAbsent,
                      pressed && !blocked && styles.pressedSoft,
                      blocked && styles.disabledBtn,
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

                {s.attendance === 'present' ? (
                  <View style={styles.checklist}>
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
                          <CheckTile
                            label={CHIP_META[k].label}
                            state={s.chips[k]}
                            disabled={blocked}
                            onPress={() => toggle(si, k)}
                          />
                        </View>
                      ))}
                    </View>
                  </View>
                ) : (
                  <Text style={styles.absentNote}>
                    {s.touched
                      ? 'Marked absent — checks not needed. Tap Present to check instead.'
                      : 'Absent by default — checks are ticked and ready. Tap Present, or face scan marks them present.'}
                  </Text>
                )}

                {showRemarks ? (
                  <View style={styles.remarksWrap}>
                    <Ionicons name="chatbox-ellipses-outline" size={15} color={COLORS.textFaint} />
                    <TextInput
                      style={styles.remarks}
                      value={s.remarks?.value ?? ''}
                      onChangeText={(t) => {
                        if (s.attendance === 'present') setRemarks(si, t);
                      }}
                      placeholder="Add observation remarks…"
                      placeholderTextColor={COLORS.textFaint}
                      editable={s.attendance === 'present' && !blocked}
                    />
                  </View>
                ) : (
                  <Pressable
                    onPress={() => setRemarksOpen((prev) => ({ ...prev, [s.roll]: true }))}
                    style={({ pressed }) => [styles.remarksToggle, pressed && styles.pressedSoft]}
                  >
                    <Ionicons name="chatbox-ellipses-outline" size={15} color={COLORS.primary} />
                    <Text style={styles.remarksToggleText}>+ Add remark</Text>
                  </Pressable>
                )}
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
            <Text style={styles.saveValue}>{checkedCount} Checked</Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.saveBtn,
              pressed && !blocked && styles.pressedSoft,
              (saving || blocked) && styles.busy,
            ]}
            onPress={save}
            disabled={saving || blocked}
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
  disabledBtn: { opacity: 0.4 },
  content: { padding: SPACING.lg, paddingBottom: 28, gap: SPACING.md },

  locHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  screenTitle: {
    fontSize: 20,
    fontFamily: FONT.display,
    fontWeight: '300',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  locBannerOutside: {
    backgroundColor: COLORS.dangerSoft,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  locBannerTitle: {
    fontSize: 13,
    fontFamily: FONT.medium,
    fontWeight: '600',
    color: COLORS.danger,
    textAlign: 'center',
  },
  locBannerNote: {
    fontSize: 12,
    fontFamily: FONT.medium,
    fontWeight: '600',
    color: COLORS.danger,
    textAlign: 'center',
  },
  locBannerOther: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.warningBg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  locBannerOtherText: {
    flex: 1,
    fontSize: 13,
    fontFamily: FONT.medium,
    fontWeight: '600',
    color: COLORS.warningText,
  },

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
    fontSize: 20,
    fontFamily: FONT.display,
    fontWeight: '300',
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
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: COLORS.field,
  },
  trackFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 4 },
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
  primaryAction: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 46,
    borderRadius: 13,
    backgroundColor: COLORS.primary,
  },
  primaryActionText: { fontSize: 13.5, fontFamily: FONT.medium, fontWeight: '600', color: '#fff' },
  softAction: {
    flex: 1.2,
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
  actionDisabled: { opacity: 0.45 },

  legend: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontFamily: FONT.regular,
    textAlign: 'center',
  },

  rosterHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  rosterTitle: { fontSize: 17, fontFamily: FONT.bold, fontWeight: '700', color: COLORS.text },
  rosterMeta: { fontSize: 12, color: COLORS.textMuted, fontFamily: FONT.regular },

  studentCard: { gap: 12 },
  absentCard: { borderLeftWidth: 4, borderLeftColor: COLORS.danger },
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
  checkGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 6 },
  checkCell: { width: '32%' },
  checkTile: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.field,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  checkTileOk: { backgroundColor: COLORS.successSoft, borderColor: COLORS.compliant },
  checkTileNo: { backgroundColor: COLORS.dangerSoft, borderColor: COLORS.danger },
  checkTileDisabled: { opacity: 0.45 },
  checkSymbol: { fontSize: 20, fontWeight: '700', color: COLORS.textFaint, lineHeight: 22 },
  checkSymbolOk: { color: COLORS.compliant },
  checkSymbolNo: { color: COLORS.danger },
  checkTileLabel: { fontSize: 11, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  absentNote: { fontSize: 12, color: COLORS.textMuted, fontFamily: FONT.regular, lineHeight: 17 },

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
  remarksToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: 4,
  },
  remarksToggleText: { fontSize: 12.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.primary },

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
