/**
 * Heads' Attendance list — today's rows for every class in scope, with an
 * Absent/Present segment and Wing-wise / Class-wise / Student-wise grouping.
 *
 * Wing-wise is honest: the home endpoint sends no wing per class yet, so the
 * principal sees a note + the class-wise list; a section head sees a single
 * "Your wing" group (their roster IS their wing). No wing is ever invented
 * for a class, and level bands (Preschool/Primary/…) are not called wings.
 *
 * Notify opens the parent's WhatsApp chat pre-filled — the same flow as the
 * Defaulters screen: the stored number comes from getWhatsappMap, and when
 * there is none the WhatsAppNumberModal collects it.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, FONT, SPACING } from '@/constants/theme';
import { Panel, Pill } from '@/components/UI';
import WhatsAppNumberModal from '@/components/WhatsAppNumberModal';
import { fetchDefaulters, monthStart } from '@/services/fees';
import { buildAbsentRangeMessage } from '@/services/messages';
import { getWhatsappMap, isWhatsAppInstalled, waLink } from '@/services/whatsapp';
import { todayISO, type ReportRow } from '@/services/domain';
import type { ClassStatus } from '@/types';

type Filter = 'absent' | 'present';
type Grouping = 'wing' | 'class' | 'student';

const GROUP_LIMIT = 3;
const FLAT_LIMIT = 6;

function initials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

function rollLabel(roll: string): string {
  return `Roll #${/^\d+$/.test(roll) ? roll.padStart(2, '0') : roll}`;
}

function prettyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

interface Group {
  key: string;
  title: string;
  sub?: string;
  rows: ReportRow[];
}

export default function HeadsAttendanceList({
  classes,
  role,
  rows,
  loading,
  error,
  onRefresh,
  initialFilter,
  onBack,
}: {
  classes: ClassStatus[];
  role: 'principal' | 'section_head';
  rows: ReportRow[] | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  initialFilter: Filter;
  onBack: () => void;
}) {
  const today = todayISO();
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [grouping, setGrouping] = useState<Grouping>('wing');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [waMaps, setWaMaps] = useState<Record<string, Record<string, string>>>({});
  const [waInstalled, setWaInstalled] = useState<boolean | null>(null);
  const [numberFor, setNumberFor] = useState<{
    roll: string;
    name: string;
    className: string;
  } | null>(null);
  const [monthDays, setMonthDays] = useState<Record<string, number>>({});
  const daysTried = useRef(false);

  const teacherByClass = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of classes) m.set(c.className, c.teacher || '');
    return m;
  }, [classes]);

  // The server does not send a wing per class yet (see the wing-tag note).
  // Read it when it arrives; until then the map stays empty and the
  // principal's Wing-wise view falls back honestly (see wingMissing below).
  const wingByClass = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of classes) {
      const wing = (c as unknown as { wing?: unknown }).wing;
      if (typeof wing === 'string' && wing.trim()) m.set(c.className, wing.trim());
    }
    return m;
  }, [classes]);

  // WhatsApp numbers, per class in scope (same source as the Defaulters screen).
  useEffect(() => {
    if (!rows) return;
    let active = true;
    const names = [...new Set(rows.map((r) => r.className))];
    void Promise.all(
      names.map(async (name) => ({ name, map: await getWhatsappMap(name) }))
    ).then((loaded) => {
      if (!active) return;
      setWaMaps((prev) => {
        const next = { ...prev };
        for (const { name, map } of loaded) next[name] = map;
        return next;
      });
    });
    return () => {
      active = false;
    };
  }, [rows]);

  useEffect(() => {
    isWhatsAppInstalled().then(setWaInstalled);
  }, []);

  // "Absent N days this month" — best effort, once. When the server cannot
  // answer without a class filter the line is simply omitted, never faked.
  useEffect(() => {
    if (!rows || daysTried.current) return;
    daysTried.current = true;
    void fetchDefaulters({ type: 'absent', from: monthStart(), to: today })
      .then((report) => {
        if (!report?.rows?.length) return;
        const m: Record<string, number> = {};
        for (const r of report.rows) m[r.roll] = r.days;
        setMonthDays(m);
      })
      .catch(() => undefined);
  }, [rows, today]);

  const absentRows = useMemo(() => (rows ?? []).filter((r) => r.absent), [rows]);
  const presentRows = useMemo(() => (rows ?? []).filter((r) => !r.absent), [rows]);

  const shown = useMemo(() => {
    const base = filter === 'absent' ? absentRows : presentRows;
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (r) => r.name.toLowerCase().includes(q) || r.roll.toLowerCase().includes(q)
    );
  }, [filter, absentRows, presentRows, query]);

  const classGroups = useMemo<Group[]>(() => {
    const by = new Map<string, ReportRow[]>();
    for (const r of shown) {
      const arr = by.get(r.className) ?? [];
      arr.push(r);
      by.set(r.className, arr);
    }
    return [...by.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, rs]) => ({
        key: `class:${name}`,
        title: `Class ${name}`,
        sub: teacherByClass.get(name) || undefined,
        rows: rs,
      }));
  }, [shown, teacherByClass]);

  const wingMissing = role === 'principal' && grouping === 'wing' && wingByClass.size === 0;

  const groups = useMemo<Group[]>(() => {
    if (grouping === 'student') {
      return [
        {
          key: 'all',
          title: 'All students',
          rows: [...shown].sort((a, b) => a.name.localeCompare(b.name)),
        },
      ];
    }
    if (grouping === 'class') return classGroups;
    if (role === 'section_head') {
      return [{ key: 'wing:mine', title: 'Your wing', rows: shown }];
    }
    // Principal, no wing data from the server: fall back to the class-wise
    // list (with the note rendered above it) rather than inventing wings.
    if (wingByClass.size === 0) return classGroups;
    const by = new Map<string, ReportRow[]>();
    const unassigned: ReportRow[] = [];
    for (const r of shown) {
      const w = wingByClass.get(r.className);
      if (w) {
        const arr = by.get(w) ?? [];
        arr.push(r);
        by.set(w, arr);
      } else {
        unassigned.push(r);
      }
    }
    const out = [...by.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([wing, rs]) => ({ key: `wing:${wing}`, title: `${wing} Wing`, rows: rs }));
    if (unassigned.length) {
      out.push({ key: 'wing:none', title: 'No wing assigned', rows: unassigned });
    }
    return out;
  }, [grouping, shown, classGroups, role, wingByClass]);

  const notify = useCallback(
    async (row: ReportRow) => {
      const number = waMaps[row.className]?.[row.roll] || '';
      if (!number) {
        setNumberFor({ roll: row.roll, name: row.name, className: row.className });
        return;
      }
      const message = buildAbsentRangeMessage({
        studentName: row.name,
        roll: row.roll,
        className: row.className,
        from: today,
        to: today,
        days: 1,
      });
      try {
        await Linking.openURL(waLink(number, message));
      } catch {
        Alert.alert('WhatsApp', `Could not open WhatsApp for ${row.name}`);
      }
    },
    [waMaps, today]
  );

  const renderRow = (row: ReportRow, last: boolean) => {
    const teacher = teacherByClass.get(row.className) || '';
    const days = monthDays[row.roll];
    return (
      <View
        key={`${row.className}:${row.roll}`}
        style={[styles.row, !last && styles.rowBorder]}
      >
        <View
          style={[styles.avatar, row.absent ? styles.avatarAbsent : styles.avatarPresent]}
        >
          <Text
            style={[
              styles.avatarText,
              row.absent ? styles.avatarTextAbsent : styles.avatarTextPresent,
            ]}
          >
            {initials(row.name)}
          </Text>
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowName} numberOfLines={1}>
            {row.name}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {rollLabel(row.roll)} · {row.className}
            {teacher ? ` · ${teacher}` : ''}
          </Text>
          {row.absent && days !== undefined ? (
            <Text style={styles.rowDays}>
              Absent {days} day{days === 1 ? '' : 's'} this month
            </Text>
          ) : null}
        </View>
        {row.absent ? (
          <Pressable
            onPress={() => void notify(row)}
            style={({ pressed }) => [styles.notifyBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Notify parent of ${row.name}`}
          >
            <Ionicons name="logo-whatsapp" size={13} color={COLORS.success} />
            <Text style={styles.notifyText}>Notify</Text>
          </Pressable>
        ) : (
          <Pill label="Present" tone="mint" />
        )}
      </View>
    );
  };

  const renderGroup = (g: Group) => {
    const isOpen = expanded.has(g.key);
    const limit = grouping === 'student' ? FLAT_LIMIT : GROUP_LIMIT;
    const visible = isOpen ? g.rows : g.rows.slice(0, limit);
    const more = g.rows.length - visible.length;
    return (
      <View key={g.key}>
        <View style={styles.groupHead}>
          <Text style={styles.groupTitle}>{g.title}</Text>
          {g.sub ? <Text style={styles.groupSub}>{g.sub}</Text> : null}
          <View style={styles.flex} />
          <Text style={styles.groupCount}>
            {g.rows.length} {filter === 'absent' ? 'absent' : 'present'}
          </Text>
        </View>
        <Panel style={styles.groupCard}>
          {visible.map((r, i) => renderRow(r, i === visible.length - 1 && more === 0))}
          {more > 0 ? (
            <Pressable
              onPress={() => setExpanded((prev) => new Set(prev).add(g.key))}
              style={styles.moreRow}
            >
              <Text style={styles.moreText}>
                + {more} more in {g.title}
              </Text>
              <Text style={styles.moreLink}>View all ›</Text>
            </Pressable>
          ) : null}
        </Panel>
      </View>
    );
  };

  const scopeLine =
    role === 'principal'
      ? `All wings · ${classes.length} classes`
      : `Your wing · ${classes.length} sections`;

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
          <Text style={styles.title}>Attendance — Today</Text>
          <Text style={styles.scope}>
            {prettyDate(today)} · {scopeLine}
          </Text>
        </View>
        <Pill
          label={
            filter === 'absent'
              ? `${absentRows.length} Absent`
              : `${presentRows.length} Present`
          }
          tone={filter === 'absent' ? 'rose' : 'mint'}
          solid={filter === 'absent'}
        />
      </View>

      <View style={styles.segment}>
        <Pressable
          onPress={() => setFilter('absent')}
          style={[styles.segBtn, filter === 'absent' && styles.segAbsent]}
        >
          <Text style={[styles.segText, filter === 'absent' && styles.segTextOn]}>
            Absent · {absentRows.length}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setFilter('present')}
          style={[styles.segBtn, filter === 'present' && styles.segPresent]}
        >
          <Text style={[styles.segText, filter === 'present' && styles.segTextOn]}>
            Present · {presentRows.length}
          </Text>
        </Pressable>
      </View>

      <View style={styles.chips}>
        {(['wing', 'class', 'student'] as Grouping[]).map((g) => (
          <Pressable
            key={g}
            onPress={() => setGrouping(g)}
            style={[styles.chip, grouping === g && styles.chipOn]}
          >
            <Text style={[styles.chipText, grouping === g && styles.chipTextOn]}>
              {g === 'wing' ? 'Wing-wise' : g === 'class' ? 'Class-wise' : 'Student-wise'}
            </Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        placeholder="Search name or roll…"
        placeholderTextColor={COLORS.textFaint}
        autoCorrect={false}
      />

      {waInstalled === false ? (
        <Text style={styles.waNote}>
          WhatsApp is not installed on this device — Notify needs WhatsApp.
        </Text>
      ) : null}

      {loading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={styles.stateText}>Loading today&apos;s attendance…</Text>
        </View>
      ) : error ? (
        <View style={styles.stateBox}>
          <Text style={styles.errText}>{error}</Text>
          <Pressable onPress={onRefresh} style={styles.retryBtn}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : !rows || rows.length === 0 ? (
        <View style={styles.stateBox}>
          <Text style={styles.stateText}>No attendance recorded yet today.</Text>
          <Pressable onPress={onRefresh} style={styles.retryBtn}>
            <Text style={styles.retryText}>Refresh</Text>
          </Pressable>
        </View>
      ) : shown.length === 0 ? (
        <View style={styles.stateBox}>
          <Text style={styles.stateText}>
            No {filter === 'absent' ? 'absentees' : 'present students'} match “{query}”.
          </Text>
        </View>
      ) : (
        <View style={styles.groups}>
          {wingMissing ? (
            <View style={styles.wingNote}>
              <Ionicons name="information-circle-outline" size={16} color={COLORS.warning} />
              <Text style={styles.wingNoteText}>
                Wing info comes from the school server — each class needs a wing tag (Boys /
                Girls / Preschool). Showing all classes below.
              </Text>
            </View>
          ) : null}
          {groups.map(renderGroup)}
        </View>
      )}

      {numberFor ? (
        <WhatsAppNumberModal
          visible
          className={numberFor.className}
          roll={numberFor.roll}
          studentName={numberFor.name}
          onClose={() => setNumberFor(null)}
          onSaved={(number) => {
            setWaMaps((prev) => ({
              ...prev,
              [numberFor.className]: {
                ...(prev[numberFor.className] || {}),
                [numberFor.roll]: number,
              },
            }));
            setNumberFor(null);
          }}
        />
      ) : null}
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

  segment: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: COLORS.field,
    borderRadius: 999,
    padding: 4,
  },
  segBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segAbsent: { backgroundColor: COLORS.danger },
  segPresent: { backgroundColor: COLORS.success },
  segText: { fontSize: 13, fontFamily: FONT.regular, color: COLORS.textMuted },
  segTextOn: { color: '#fff' },

  chips: { flexDirection: 'row', gap: 6 },
  chip: {
    minHeight: 32,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 12.5, fontFamily: FONT.regular, color: COLORS.textMuted },
  chipTextOn: { color: '#fff' },

  search: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 13,
    fontFamily: FONT.regular,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
  },
  waNote: { fontSize: 11.5, color: COLORS.warningText, fontFamily: FONT.regular },

  stateBox: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  stateText: { fontSize: 13, color: COLORS.textMuted, fontFamily: FONT.regular, textAlign: 'center' },
  errText: { fontSize: 13, color: COLORS.danger, fontFamily: FONT.regular, textAlign: 'center' },
  retryBtn: {
    minHeight: 40,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { fontSize: 13, fontFamily: FONT.regular, color: '#fff' },

  groups: { gap: SPACING.md },
  wingNote: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: COLORS.warningBg,
    borderRadius: 12,
    padding: 10,
    alignItems: 'flex-start',
  },
  wingNoteText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.warningText,
    fontFamily: FONT.regular,
    lineHeight: 17,
  },

  groupHead: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 6 },
  groupTitle: { fontSize: 12, fontFamily: FONT.regular, color: COLORS.textMuted },
  groupSub: { fontSize: 11, color: COLORS.textFaint, fontFamily: FONT.regular },
  groupCount: { fontSize: 11, color: COLORS.textFaint, fontFamily: FONT.regular },
  groupCard: { paddingVertical: 2 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.outline },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarAbsent: { backgroundColor: COLORS.dangerSoft },
  avatarPresent: { backgroundColor: COLORS.successSoft },
  avatarText: { fontSize: 13, fontFamily: FONT.display, fontWeight: '300' },
  avatarTextAbsent: { color: COLORS.danger },
  avatarTextPresent: { color: COLORS.success },
  rowBody: { flex: 1 },
  rowName: { fontSize: 13.5, fontFamily: FONT.regular, color: COLORS.text },
  rowMeta: { fontSize: 11, color: COLORS.textMuted, marginTop: 1, fontFamily: FONT.regular },
  rowDays: { fontSize: 11, color: COLORS.textFaint, marginTop: 1, fontFamily: FONT.regular },
  notifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.successSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  notifyText: { fontSize: 11, fontFamily: FONT.regular, color: COLORS.success },
  moreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  moreText: { fontSize: 12, color: COLORS.textMuted, fontFamily: FONT.regular },
  moreLink: { fontSize: 12, color: COLORS.primary, fontFamily: FONT.regular },
});
