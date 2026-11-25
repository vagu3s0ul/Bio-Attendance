/**
 * Defaulter Registry — the one place a teacher or admin finds every student who
 * needs a nudge, and sends (or schedules) the WhatsApp message from the same list.
 *
 *   Absent   — absence days over the chosen range
 *   Uniform  — failed checkpoints over the same range (the "uniform report")
 *   Fees     — unpaid balance for a month (needs dues entered in /fees)
 *
 * WhatsApp cannot send by itself, so "WhatsApp (N)" opens the chat pre-filled and
 * a scheduled reminder is a local notification whose tap opens that chat.
 *
 * UI layer follows the 2026 M3 mockup (step_6_defaulters); all three reports are
 * fetched in parallel so the tab pills show real count badges.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import Screen from '@/components/Screen';
import WhatsAppNumberModal from '@/components/WhatsAppNumberModal';
import { FONT, M3, SHADOW } from '@/constants/theme';
import {
  DefaulterReport,
  FeeDefaulters,
  daysAgo,
  fetchDefaulters,
  fetchFeeDefaulters,
  money,
  monthLabel,
  monthStart,
  recentMonths,
} from '@/services/fees';
import { Notice, fetchNotices, fetchProfile, fetchReportClasses } from '@/services/api';
import { getWhatsappMap, isWhatsAppInstalled, waLink } from '@/services/whatsapp';
import {
  buildAbsentRangeMessage,
  buildFeeMessage,
  buildUniformDefaulterMessage,
  checkpointLabel,
  prettyRange,
} from '@/services/messages';
import {
  ScheduledReminder,
  cancelReminder,
  listScheduledReminders,
  scheduleReminder,
} from '@/services/reminders';
import { todayISO } from '@/services/domain';
import { useSession } from '@/store/session';
import { SessionExpiredError } from '@/types';

type Tab = 'absent' | 'uniform' | 'fees';
type RangeKey = 'week' | 'month' | '30';

const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'absent', label: 'Absent', icon: 'person-remove-outline' },
  { key: 'uniform', label: 'Uniform', icon: 'shirt-outline' },
  { key: 'fees', label: 'Fees', icon: 'cash-outline' },
];

const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'week', label: 'Last 7 days' },
  { key: 'month', label: 'This month' },
  { key: '30', label: 'Last 30 days' },
];

/**
 * The principal reviews whole wings, not single classes. The server groups
 * classes into these four blocks exactly as the Daily Reckoner does.
 */
const WINGS: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'Pre-School', label: 'Pre', icon: 'color-palette-outline' },
  { key: 'Girls', label: 'Girls', icon: 'female-outline' },
  { key: 'Boys', label: 'Boys', icon: 'male-outline' },
  { key: 'College', label: 'College', icon: 'school-outline' },
];

const TIME_SLOTS = ['08:00', '10:00', '14:00', '16:00', '18:00'];

interface ChipView {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone: 'error' | 'tertiary' | 'low' | 'high';
}

/** One line in the list, already carrying its WhatsApp message. */
interface RowView {
  roll: string;
  name: string;
  className: string;
  primaryChip: ChipView;
  secondaryChip: ChipView;
  contactLabel: string;
  message: string;
}

function slotLabel(slot: string): string {
  const [h, m] = slot.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

function buildWhen(dayOffset: number, slot: string): Date {
  const [h, m] = slot.split(':').map(Number);
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Academic session year (Aug start): 2026-11-02 → "2026-27". */
function sessionLabel(): string {
  const now = new Date();
  const start = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

function rollLabel(roll: string): string {
  const padded = /^\d+$/.test(roll) ? roll.padStart(2, '0') : roll;
  return `Roll #${padded}`;
}

function initials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export default function DefaultersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const initial = ((user?.name || 'U').trim()[0] || 'U').toUpperCase();

  // Entry points may preselect a tab and a wing, e.g. the principal's
  // "Fee Defaulters" tile opens ?tab=fees.
  const params = useLocalSearchParams<{ tab?: string; wing?: string }>();
  const initialTab: Tab =
    params.tab === 'fees' || params.tab === 'uniform' || params.tab === 'absent'
      ? params.tab
      : 'absent';
  const initialWing =
    WINGS.find((w) => w.key.toLowerCase() === String(params.wing ?? '').toLowerCase())?.key ?? '';

  const [tab, setTab] = useState<Tab>(initialTab);
  const [isAdmin, setIsAdmin] = useState(false);
  /** Principal / section head: the list is scoped to a whole wing. */
  const [wingMode, setWingMode] = useState(false);
  const [wing, setWing] = useState<string>(initialWing || WINGS[0].key);
  const [classes, setClasses] = useState<string[]>([]);
  const [className, setClassName] = useState('');
  const [range, setRange] = useState<RangeKey>('month');
  const [month, setMonth] = useState(recentMonths(1)[0]);

  const [uniform, setUniform] = useState<DefaulterReport | null>(null);
  const [absent, setAbsent] = useState<DefaulterReport | null>(null);
  const [fees, setFees] = useState<FeeDefaulters | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [notices, setNotices] = useState<Notice[]>([]);
  const [waMap, setWaMap] = useState<Record<string, string>>({});
  const [waInstalled, setWaInstalled] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [numberFor, setNumberFor] = useState<{
    className: string;
    roll: string;
    name: string;
  } | null>(null);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [dayChoice, setDayChoice] = useState(0);
  const [slot, setSlot] = useState('16:00');
  const [scheduled, setScheduled] = useState<ScheduledReminder[]>([]);
  const [scheduling, setScheduling] = useState(false);

  const [filterOpen, setFilterOpen] = useState(false);

  const [queueInfo, setQueueInfo] = useState<{ index: number; total: number } | null>(null);
  const queueRolls = useRef<string[]>([]);
  const queuePos = useRef(-1);

  const listRef = useRef<ScrollView>(null);

  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastY = useRef(new Animated.Value(-10)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- filters -------------------------------------------------------------

  const from = useMemo(() => {
    if (range === 'week') return daysAgo(6);
    if (range === '30') return daysAgo(29);
    return monthStart();
  }, [range]);

  const to = useMemo(() => daysAgo(0), []);

  const months = useMemo(() => {
    const base = recentMonths(6);
    return base.includes(month) ? base : [month, ...base];
  }, [month]);

  // --- identity ------------------------------------------------------------

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const p = await fetchProfile();
        if (!active) return;
        const admin = p.role === 'admin';
        setIsAdmin(admin);
        if (admin) {
          const list = await fetchReportClasses();
          if (!active) return;
          setClasses(list);
          setClassName((prev) => prev || list[0] || '');
        } else if (p.role === 'principal' || p.role === 'section_head') {
          // The principal has no class of their own: review wing by wing.
          setWingMode(true);
        } else {
          setClassName(p.className);
        }
      } catch (e: any) {
        if (e instanceof SessionExpiredError) {
          Alert.alert('Session expired', 'Please log in again.');
          return;
        }
        if (active) setErr(e?.message || 'Could not load your class.');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // --- data (all three reports in parallel for real tab-count badges) -------

  const load = useCallback(async () => {
    if (!wingMode && !className) return;
    setLoading(true);
    setErr(null);
    const scope = wingMode ? { wing } : { className };
    try {
      const [u, a, f] = await Promise.allSettled([
        fetchDefaulters({ type: 'uniform', ...scope, from, to }),
        fetchDefaulters({ type: 'absent', ...scope, from, to }),
        fetchFeeDefaulters({ ...scope, month }),
      ]);
      if (u.status === 'fulfilled') setUniform(u.value);
      if (a.status === 'fulfilled') setAbsent(a.value);
      if (f.status === 'fulfilled') setFees(f.value);
      const failed = [u, a, f].filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected'
      );
      if (failed.length > 0) {
        const first = failed[0].reason;
        if (first instanceof SessionExpiredError) {
          Alert.alert('Session expired', 'Please log in again.');
          return;
        }
        setErr(first?.message || 'Could not load defaulters.');
      }
    } finally {
      setLoading(false);
    }
  }, [className, wingMode, wing, from, to, month]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelected(new Set());
  }, [tab, className, wing, wingMode, range, month]);

  useEffect(() => {
    isWhatsAppInstalled().then(setWaInstalled);
  }, []);

  useEffect(() => {
    listScheduledReminders().then(setScheduled);
  }, [scheduleOpen, tab]);

  useEffect(() => {
    let active = true;
    fetchNotices()
      .then((list) => {
        if (active) setNotices(list);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  // --- rows ----------------------------------------------------------------

  const rows = useMemo<RowView[]>(() => {
    if (tab === 'fees') {
      if (!fees) return [];
      return fees.rows.map((r) => ({
        roll: r.roll,
        name: r.name,
        className: r.className || fees.className,
        primaryChip: {
          icon: 'card-outline',
          label: `Fee Overdue: ${money(r.balance)}`,
          tone: 'error',
        },
        secondaryChip: {
          icon: 'send-outline',
          label: r.paid > 0 ? `Paid ${money(r.paid)}` : 'Not paid yet',
          tone: 'high',
        },
        contactLabel: "Guardian Contact",
        message: buildFeeMessage({
          studentName: r.name,
          roll: r.roll,
          className: r.className || fees.className,
          month: fees.month,
          balance: r.balance,
          paid: r.paid,
          total: r.amount,
          note: r.note,
        }),
      }));
    }

    const report = tab === 'absent' ? absent : uniform;
    if (!report) return [];

    return report.rows.map((r) => {
      if (report.type === 'absent') {
        return {
          roll: r.roll,
          name: r.name,
          className: r.className || report.className,
          primaryChip: {
            icon: 'warning-outline',
            label: `${r.days} Day${r.days === 1 ? '' : 's'} Absent`,
            tone: 'error',
          },
          secondaryChip: {
            icon: 'time-outline',
            label: prettyRange(report.from, report.to),
            tone: 'low',
          },
          contactLabel: "Father's WhatsApp",
          message: buildAbsentRangeMessage({
            studentName: r.name,
            roll: r.roll,
            className: r.className || report.className,
            from: report.from,
            to: report.to,
            days: r.days,
          }),
        };
      }

      const failed = Object.entries(r.failures || {})
        .filter(([, count]) => Number(count) > 0)
        .map(([key]) => key);

      return {
        roll: r.roll,
        name: r.name,
        className: r.className || report.className,
        primaryChip: {
          icon: 'shirt-outline',
          label: (failed.length > 0 ? failed.map(checkpointLabel).join(', ') : 'Uniform') + ' violation',
          tone: 'tertiary',
        },
        secondaryChip: {
          icon: 'time-outline',
          label: prettyRange(report.from, report.to),
          tone: 'low',
        },
        contactLabel: "Father's WhatsApp",
        message: buildUniformDefaulterMessage({
          studentName: r.name,
          roll: r.roll,
          className: r.className || report.className,
          from: report.from,
          to: report.to,
          failedItems: failed,
          days: r.days,
        }),
      };
    });
  }, [tab, fees, absent, uniform]);

  const rowsRef = useRef<RowView[]>(rows);
  rowsRef.current = rows;

  /**
   * A roll number is unique inside a class, not across a whole wing, so a
   * wing list keys every row by class + roll.
   */
  const keyOf = useCallback(
    (r: { className: string; roll: string }) => (wingMode ? `${r.className}|${r.roll}` : r.roll),
    [wingMode]
  );

  // WhatsApp numbers for every class on screen — a wing spans many classes, so
  // each class map is fetched and merged under its own key.
  useEffect(() => {
    const classList = wingMode
      ? Array.from(new Set(rows.map((r) => r.className))).filter(Boolean)
      : className
        ? [className]
        : [];
    if (classList.length === 0) {
      setWaMap({});
      return;
    }
    let active = true;
    Promise.allSettled(classList.map((c) => getWhatsappMap(c).then((m) => ({ c, m }))))
      .then((results) => {
        if (!active) return;
        const merged: Record<string, string> = {};
        results.forEach((res) => {
          if (res.status !== 'fulfilled') return;
          const { c, m } = res.value;
          Object.entries(m || {}).forEach(([roll, num]) => {
            if ((num || '').trim() === '') return;
            merged[wingMode ? `${c}|${roll}` : roll] = num;
          });
        });
        setWaMap(merged);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [className, wingMode, rows]);

  const counts: Record<Tab, number> = {
    absent: absent?.rows.length ?? 0,
    uniform: uniform?.rows.length ?? 0,
    fees: fees?.rows.length ?? 0,
  };

  const unread = notices.filter((n) => !n.read).length;

  const hasNumber = useCallback(
    (r: { className: string; roll: string }) => (waMap[keyOf(r)] || '').trim() !== '',
    [waMap, keyOf]
  );
  const sendable = rows.filter(hasNumber);
  const selectedRows = rows.filter((r) => selected.has(keyOf(r)));
  const selectedSendable = selectedRows.filter(hasNumber);
  const allOn = sendable.length > 0 && sendable.every((r) => selected.has(keyOf(r)));

  // --- toast ---------------------------------------------------------------

  const showToast = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    Animated.parallel([
      Animated.timing(toastOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(toastY, { toValue: 0, useNativeDriver: true, friction: 7 }),
    ]).start();
    toastTimer.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(toastOpacity, { toValue: 0, duration: 240, useNativeDriver: true }),
        Animated.timing(toastY, { toValue: -10, duration: 240, useNativeDriver: true }),
      ]).start();
    }, 3500);
  }, [toastOpacity, toastY]);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  // --- sending -------------------------------------------------------------

  const openKey = useCallback(
    async (key: string) => {
      const row = rowsRef.current.find((r) => keyOf(r) === key);
      const number = waMap[key] || '';
      if (!row || !number) return;
      try {
        await Linking.openURL(waLink(number, row.message));
      } catch {
        Alert.alert('WhatsApp', 'Could not open WhatsApp for ' + row.name);
      }
    },
    [waMap, keyOf]
  );

  const advanceQueue = useCallback(() => {
    if (queuePos.current < 0) return;
    const next = queuePos.current + 1;
    if (next >= queueRolls.current.length) {
      queuePos.current = -1;
      queueRolls.current = [];
      setQueueInfo(null);
      return;
    }
    queuePos.current = next;
    setQueueInfo({ index: next, total: queueRolls.current.length });
    openKey(queueRolls.current[next]);
  }, [openKey]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && queuePos.current >= 0) advanceQueue();
    });
    return () => sub.remove();
  }, [advanceQueue]);

  const startQueue = (keys: string[]) => {
    if (keys.length === 0) return;
    queueRolls.current = keys;
    queuePos.current = 0;
    setQueueInfo({ index: 0, total: keys.length });
    showToast();
    openKey(keys[0]);
  };

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    setSelected((prev) => {
      const all = sendable.map(keyOf);
      const on = all.length > 0 && all.every((key) => prev.has(key));
      if (on) {
        const next = new Set(prev);
        all.forEach((key) => next.delete(key));
        return next;
      }
      return new Set<string>(all);
    });
  };

  // --- scheduling ----------------------------------------------------------

  const doSchedule = async () => {
    const targets = selectedSendable;
    if (targets.length === 0) return;

    const when = buildWhen(dayChoice, slot);
    if (when.getTime() <= Date.now()) {
      Alert.alert('Pick a later time', 'That moment has already passed today.');
      return;
    }

    const titleBase =
      tab === 'fees' ? 'Fee reminder' : tab === 'absent' ? 'Absence reminder' : 'Uniform reminder';

    setScheduling(true);
    let done = 0;
    try {
      for (const row of targets) {
        await scheduleReminder({
          when,
          title: `${titleBase} — ${row.name}`,
          body: `Tap to send the WhatsApp message for ${row.name} (Roll ${row.roll}).`,
          link: waLink(waMap[keyOf(row)] || '', row.message),
          student: row.name,
          roll: row.roll,
        });
        done++;
      }
      setScheduled(await listScheduledReminders());
      setScheduleOpen(false);
      Alert.alert(
        'Reminder scheduled',
        `${done} reminder${done === 1 ? '' : 's'} will appear at ${slotLabel(slot)}. Tap the notification then to open WhatsApp.`
      );
    } catch (e: any) {
      Alert.alert('Reminder', e?.message || 'Could not schedule the reminder.');
    } finally {
      setScheduling(false);
    }
  };

  const cancelOne = async (id: string) => {
    await cancelReminder(id);
    setScheduled(await listScheduledReminders());
  };

  // --- CSV export ----------------------------------------------------------

  const buildCsv = useCallback(() => {
    const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
    const head = ['Name', 'Roll', 'Class', 'Detail', 'Message'];
    const lines = rows.map((r) =>
      [r.name, r.roll, r.className, r.primaryChip.label, r.message].map(esc).join(',')
    );
    return [head.map(esc).join(','), ...lines].join('\n');
  }, [rows]);

  const exportCsv = useCallback(async () => {
    if (rows.length === 0) return;
    const csv = buildCsv();
    const file = `sps-defaulters-${tab}-${todayISO()}.csv`;
    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return;
    }
    try {
      const uri = `${FileSystem.cacheDirectory ?? ''}${file}`;
      await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      Alert.alert('CSV exported', `Saved to\n${uri}`);
    } catch (e: any) {
      Alert.alert('CSV', e?.message || 'Could not save the CSV.');
    }
  }, [rows, buildCsv, tab]);

  // --- render helpers ------------------------------------------------------

  const renderRow = (row: RowView) => {
    const key = keyOf(row);
    const number = (waMap[key] || '').trim();
    const numbered = number !== '';
    const on = selected.has(key);
    const primaryTone = row.primaryChip.tone;
    const secondaryTone = row.secondaryChip.tone;
    return (
      <View key={row.roll} style={styles.rowCard}>
        <View
          style={[
            styles.stripe,
            primaryTone === 'tertiary' ? styles.stripeTertiary : styles.stripeError,
          ]}
        />
        <Pressable
          style={styles.rowHead}
          onPress={() => numbered && toggleSelect(key)}
          disabled={!numbered || queueInfo !== null}
        >
          <View style={on ? [styles.check, styles.checkOn] : styles.check}>
            {on ? <Ionicons name="checkmark" size={15} color={M3.onPrimary} /> : null}
          </View>
          <View style={styles.rowAvatar}>
            <Text style={styles.rowAvatarText}>{initials(row.name)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.rowNameLine}>
              <Text style={styles.rowName} numberOfLines={1}>
                {row.name}
              </Text>
              <View style={styles.rollChip}>
                <Text style={styles.rollChipText}>{rollLabel(row.roll)}</Text>
              </View>
            </View>
            <Text style={styles.rowClass} numberOfLines={1}>
              Class {row.className}
            </Text>
          </View>
        </Pressable>

        <View style={styles.chipCol}>
          <View style={[styles.statChip, primaryTone === 'tertiary' ? styles.chipTertiary : styles.chipError]}>
            <Ionicons
              name={row.primaryChip.icon}
              size={14}
              color={primaryTone === 'tertiary' ? M3.onTertiaryFixed : M3.onErrorContainer}
            />
            <Text
              style={[styles.statChipText, primaryTone === 'tertiary' ? styles.chipTextTertiary : styles.chipTextError]}
              numberOfLines={1}
            >
              {row.primaryChip.label}
            </Text>
          </View>
          <View style={[styles.statChip, secondaryTone === 'high' ? styles.chipHigh : styles.chipLow]}>
            <Ionicons
              name={row.secondaryChip.icon}
              size={14}
              color={secondaryTone === 'high' ? M3.tertiary : M3.onSurfaceVariant}
            />
            <Text style={[styles.statChipText, styles.chipTextLow]} numberOfLines={1}>
              {row.secondaryChip.label}
            </Text>
          </View>
        </View>

        <Pressable
          style={styles.contactBox}
          onPress={() => !numbered && setNumberFor({ className: row.className, roll: row.roll, name: row.name })}
          disabled={numbered}
        >
          <View style={styles.contactIcon}>
            <Ionicons name="call-outline" size={16} color={M3.onSecondaryContainer} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.contactLabel}>{row.contactLabel}</Text>
            <Text style={styles.contactNumber} numberOfLines={1}>
              {numbered ? number : 'No number on file — tap to add'}
            </Text>
          </View>
          <View style={styles.contactChip}>
            <Ionicons
              name={numbered ? 'logo-whatsapp' : 'add'}
              size={12}
              color={numbered ? M3.secondary : M3.primary}
            />
            <Text style={[styles.contactChipText, numbered ? styles.contactChipTextOn : styles.contactChipTextAdd]}>
              {numbered ? 'WhatsApp' : 'Add'}
            </Text>
          </View>
        </Pressable>
      </View>
    );
  };

  return (
    <Screen style={styles.screen}>
      <View style={styles.page}>
        {/* App bar */}
        <View style={styles.appBar}>
          <View style={styles.emblem}>
            <Ionicons name="school" size={16} color={M3.primary} />
          </View>
          <View style={styles.titles}>
            <Text style={styles.title} numberOfLines={1}>
              Bio Attendance{' '}
              <Text style={styles.titleDot}>•</Text>{' '}
              <Text style={styles.titleSection}>Dashboard</Text>
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              Sialkot Campus
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/notices')}
            hitSlop={10}
            style={({ pressed }) => [styles.bell, pressed && styles.pressed]}
          >
            <Ionicons name="notifications-outline" size={22} color={M3.onSurface} />
            {unread > 0 ? <View style={styles.bellDot} /> : null}
          </Pressable>
          <Pressable
            onPress={() => router.push('/settings')}
            hitSlop={6}
            style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
          >
            <Text style={styles.avatarText}>{initial}</Text>
          </Pressable>
        </View>

        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Defaulter Registry</Text>
            <Text style={styles.headerSub} numberOfLines={1}>
              {wingMode
                ? `${wing === 'Pre-School' ? 'Pre-School' : wing} wing · Session ${sessionLabel()}`
                : className
                ? `Class ${className} · Session ${sessionLabel()}`
                : isAdmin
                ? 'All classes · Sialkot Campus'
                : 'Loading…'}
            </Text>
          </View>
          <View style={styles.syncPill}>
            <Ionicons name="shield-checkmark-outline" size={16} color={M3.primary} />
            <Text style={styles.syncText}>Auto-Sync ON</Text>
          </View>
        </View>

        {/* Wings — the principal reviews one whole block at a time */}
        {wingMode ? (
          <View style={styles.wingRow}>
            {WINGS.map((w) => {
              const active = wing === w.key;
              return (
                <Pressable
                  key={w.key}
                  onPress={() => setWing(w.key)}
                  style={({ pressed }) => [
                    styles.wingBtn,
                    active && styles.wingBtnActive,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Ionicons
                    name={w.icon}
                    size={15}
                    color={active ? M3.onPrimary : M3.onSurfaceVariant}
                  />
                  <Text style={[styles.wingBtnText, active && styles.wingBtnTextActive]}>
                    {w.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {/* Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabScroll}
          contentContainerStyle={styles.tabs}
        >
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={[styles.tab, active && styles.tabActive]}
              >
                <Ionicons
                  name={t.icon}
                  size={18}
                  color={active ? M3.onPrimary : M3.onSurfaceVariant}
                />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
                <View style={[styles.tabBadge, active && styles.tabBadgeActive]}>
                  <Text style={[styles.tabBadgeText, active && styles.tabBadgeTextActive]}>
                    {counts[t.key]}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* List */}
        <ScrollView
          ref={listRef}
          style={styles.scroll}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={load}
              tintColor={M3.primary}
              colors={[M3.primary]}
            />
          }
        >
          {/* Select All */}
          <View style={styles.selectCard}>
            <Pressable
              style={styles.selectMain}
              onPress={selectAll}
              disabled={sendable.length === 0 || queueInfo !== null}
            >
              <View style={allOn ? [styles.bigCheck, styles.bigCheckOn] : styles.bigCheck}>
                {allOn ? <Ionicons name="checkmark" size={16} color={M3.onPrimary} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.selectTitle}>
                  Select All ({sendable.length} student{sendable.length === 1 ? '' : 's'})
                </Text>
                <Text style={styles.selectSub} numberOfLines={1}>
                  {wingMode
                    ? `${wing === 'Pre-School' ? 'Pre-School' : wing} wing`
                    : className
                    ? `Class ${className}`
                    : isAdmin
                    ? 'All classes'
                    : 'Loading…'}
                </Text>
              </View>
              <Pressable style={styles.iconBtn} onPress={() => setFilterOpen(true)} hitSlop={6}>
                <Ionicons name="filter-outline" size={20} color={M3.onSurfaceVariant} />
              </Pressable>
              <Pressable
                style={styles.iconBtn}
                onPress={exportCsv}
                hitSlop={6}
                disabled={rows.length === 0}
              >
                <Ionicons
                  name="download-outline"
                  size={20}
                  color={rows.length === 0 ? M3.outline : M3.onSurfaceVariant}
                />
              </Pressable>
            </Pressable>
          </View>

          {waInstalled === false ? (
            <View style={styles.noWa}>
              <Ionicons name="logo-whatsapp" size={15} color={M3.onErrorContainer} />
              <Text style={styles.noWaText}>
                WhatsApp isn't installed here, so chats can't be opened. Numbers and reminders
                still work.
              </Text>
            </View>
          ) : null}

          {err ? (
            <View style={styles.errBox}>
              <Ionicons name="alert-circle" size={16} color={M3.onErrorContainer} />
              <Text style={styles.errText}>{err}</Text>
            </View>
          ) : null}

          {loading && rows.length === 0 ? (
            <ActivityIndicator style={{ marginTop: 20 }} color={M3.primary} />
          ) : null}

          {!loading && rows.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="checkmark-circle-outline" size={26} color={M3.secondary} />
              <Text style={styles.emptyTitle}>
                {tab === 'fees' ? 'No fee defaulters' : 'Nobody on the list'}
              </Text>
              <Text style={styles.emptyBody}>
                {tab === 'fees'
                  ? 'Either every student has paid for this month, or dues have not been entered yet.'
                  : 'No student failed a checkpoint or was absent in this range.'}
              </Text>
              {tab === 'fees' && isAdmin ? (
                <Pressable style={styles.emptyBtn} onPress={() => router.push('/fees')}>
                  <Ionicons name="create-outline" size={15} color={M3.onPrimary} />
                  <Text style={styles.emptyBtnText}>Enter fee dues</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {rows.map((row) => renderRow(row))}

          {tab === 'fees' && isAdmin ? (
            <Pressable style={styles.manageBtn} onPress={() => router.push('/fees')}>
              <Ionicons name="create-outline" size={16} color={M3.primary} />
              <Text style={styles.manageBtnText}>Enter or edit {monthLabel(month)} dues</Text>
            </Pressable>
          ) : null}

          <View style={{ height: 200 }} />
        </ScrollView>

        {/* Sticky action bar */}
        <View style={[styles.actionWrap, { bottom: insets.bottom + 8 }]}>
          <View style={styles.actionBar}>
            {queueInfo ? (
              <View style={styles.queueRow}>
                <ActivityIndicator size="small" color={M3.primary} />
                <Text style={styles.queueText}>
                  Sending {queueInfo.index + 1} of {queueInfo.total} — tap Send in WhatsApp, then
                  come back
                </Text>
              </View>
            ) : (
              <View style={styles.actionRow}>
                <Pressable
                  style={[
                    styles.waBtn,
                    (selectedSendable.length === 0 || waInstalled === false) && styles.btnOff,
                  ]}
                  onPress={() => startQueue(selectedSendable.map(keyOf))}
                  disabled={selectedSendable.length === 0 || waInstalled === false}
                >
                  <Ionicons name="logo-whatsapp" size={22} color={M3.onPrimary} />
                  <Text style={styles.waBtnText}>WhatsApp ({selectedSendable.length})</Text>
                </Pressable>
                <Pressable
                  style={[styles.scheduleBtn, selectedSendable.length === 0 && styles.btnOff]}
                  onPress={() => setScheduleOpen(true)}
                  disabled={selectedSendable.length === 0}
                >
                  <Ionicons name="alarm-outline" size={18} color={M3.onSurface} />
                  <Text style={styles.scheduleBtnText}>Schedule</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        {/* Toast */}
        <Animated.View
          pointerEvents="none"
          style={[styles.toastWrap, { opacity: toastOpacity, transform: [{ translateY: toastY }] }]}
        >
          <View style={styles.toastPill}>
            <Ionicons name="checkmark-done-outline" size={22} color={M3.primaryFixed} />
            <View style={{ flex: 1 }}>
              <Text style={styles.toastTitle}>Broadcasting Reminders...</Text>
              <Text style={styles.toastSub}>Dispatched to SPS Sialkot WhatsApp Gateway.</Text>
            </View>
          </View>
        </Animated.View>

        {/* Filter modal */}
        <Modal
          visible={filterOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setFilterOpen(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalHead}>
                <Text style={styles.modalTitle}>Filters</Text>
                <Pressable onPress={() => setFilterOpen(false)} hitSlop={10}>
                  <Ionicons name="close" size={20} color={M3.onSurfaceVariant} />
                </Pressable>
              </View>

              {wingMode ? (
                <>
                  <Text style={styles.modalLabel}>Wing</Text>
                  <View style={styles.modalChips}>
                    {WINGS.map((w) => (
                      <Pressable
                        key={w.key}
                        style={[styles.chip, wing === w.key && styles.chipActive]}
                        onPress={() => setWing(w.key)}
                      >
                        <Text style={[styles.chipText, wing === w.key && styles.chipTextActive]}>
                          {w.key}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}

              {isAdmin && classes.length > 0 ? (
                <>
                  <Text style={styles.modalLabel}>Class</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.filterChipScroll}
                    contentContainerStyle={styles.filterChips}
                  >
                    {classes.map((c) => (
                      <Pressable
                        key={c}
                        style={[styles.chip, className === c && styles.chipActive]}
                        onPress={() => setClassName(c)}
                      >
                        <Text style={[styles.chipText, className === c && styles.chipTextActive]}>
                          {c}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              ) : null}

              {tab === 'fees' ? (
                <>
                  <Text style={styles.modalLabel}>Month</Text>
                  <View style={styles.modalChips}>
                    {months.map((m) => (
                      <Pressable
                        key={m}
                        style={[styles.chip, month === m && styles.chipActive]}
                        onPress={() => setMonth(m)}
                      >
                        <Text style={[styles.chipText, month === m && styles.chipTextActive]}>
                          {monthLabel(m)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.modalLabel}>Range</Text>
                  <View style={styles.modalChips}>
                    {RANGES.map((r) => (
                      <Pressable
                        key={r.key}
                        style={[styles.chip, range === r.key && styles.chipActive]}
                        onPress={() => setRange(r.key)}
                      >
                        <Text style={[styles.chipText, range === r.key && styles.chipTextActive]}>
                          {r.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              <Pressable style={styles.modalDone} onPress={() => setFilterOpen(false)}>
                <Text style={styles.modalDoneText}>Done</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* Schedule modal */}
        <Modal
          visible={scheduleOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setScheduleOpen(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Schedule reminder</Text>
              <Text style={styles.modalBody}>
                {selectedSendable.length} student{selectedSendable.length === 1 ? '' : 's'} ·
                you'll get a notification; tapping it opens the pre-filled WhatsApp chat.
              </Text>

              <Text style={styles.modalLabel}>Day</Text>
              <View style={styles.modalChips}>
                {[0, 1, 2].map((offset) => (
                  <Pressable
                    key={offset}
                    style={[styles.chip, dayChoice === offset && styles.chipActive]}
                    onPress={() => setDayChoice(offset)}
                  >
                    <Text style={[styles.chipText, dayChoice === offset && styles.chipTextActive]}>
                      {offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : 'In 2 days'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.modalLabel}>Time</Text>
              <View style={styles.modalChips}>
                {TIME_SLOTS.map((s) => (
                  <Pressable
                    key={s}
                    style={[styles.chip, slot === s && styles.chipActive]}
                    onPress={() => setSlot(s)}
                  >
                    <Text style={[styles.chipText, slot === s && styles.chipTextActive]}>
                      {slotLabel(s)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {scheduled.length > 0 ? (
                <View style={styles.scheduledBox}>
                  <Text style={styles.modalLabel}>Already scheduled ({scheduled.length})</Text>
                  {scheduled.slice(0, 4).map((r) => (
                    <View key={r.id} style={styles.scheduledRow}>
                      <Text style={styles.scheduledText} numberOfLines={1}>
                        {r.student} · {new Date(r.when).toLocaleString()}
                      </Text>
                      <Pressable onPress={() => cancelOne(r.id)} hitSlop={8}>
                        <Ionicons name="close-circle" size={17} color={M3.onSurfaceVariant} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={styles.modalActions}>
                <Pressable style={styles.modalCancel} onPress={() => setScheduleOpen(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalConfirm, scheduling && styles.btnOff]}
                  onPress={doSchedule}
                  disabled={scheduling}
                >
                  {scheduling ? (
                    <ActivityIndicator size="small" color={M3.onPrimary} />
                  ) : (
                    <Text style={styles.modalConfirmText}>Schedule</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {numberFor ? (
          <WhatsAppNumberModal
            visible
            className={numberFor.className}
            roll={numberFor.roll}
            studentName={numberFor.name}
            onClose={() => setNumberFor(null)}
            onSaved={(number) => {
              setWaMap((prev) => ({
                ...prev,
                [wingMode ? `${numberFor.className}|${numberFor.roll}` : numberFor.roll]: number,
              }));
              setNumberFor(null);
            }}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: M3.surface },
  page: { flex: 1, width: '100%', maxWidth: 448, alignSelf: 'center' },

  // App bar
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  emblem: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: M3.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titles: { flex: 1 },
  title: { fontSize: 13.5, fontFamily: FONT.regular, fontWeight: '400', color: M3.onSurface },
  titleSection: { fontSize: 13, fontFamily: FONT.regular, fontWeight: '400', color: M3.primary },
  titleDot: { fontSize: 13, color: M3.outline },
  sub: { fontSize: 11, color: M3.onSurfaceVariant, marginTop: 1, fontFamily: FONT.regular },
  bell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: M3.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: M3.error,
    borderWidth: 2,
    borderColor: M3.surface,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: M3.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 14, fontFamily: FONT.regular, fontWeight: '400', color: M3.onPrimary },

  // Header row
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: FONT.display,
    fontWeight: '300',
    color: M3.onSurface,
    letterSpacing: -0.3,
  },
  headerSub: { fontSize: 12, color: M3.onSurfaceVariant, marginTop: 2, fontFamily: FONT.regular },

  // Wing picker (principal / section head)
  wingRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  wingBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 38,
    borderRadius: 12,
    backgroundColor: M3.surfaceContainerLow,
  },
  wingBtnActive: { backgroundColor: M3.primaryContainer },
  wingBtnText: {
    fontSize: 11.5,
    fontFamily: FONT.regular,
    fontWeight: '400',
    color: M3.onSurfaceVariant,
  },
  wingBtnTextActive: { color: M3.onPrimary, fontWeight: '600' },
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: M3.surfaceContainerHigh,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  syncText: { fontSize: 12, fontFamily: FONT.regular, fontWeight: '400', color: M3.onSurface },

  // Tabs
  tabScroll: { flexGrow: 0 },
  tabs: { gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: M3.surfaceContainerLow,
  },
  tabActive: { backgroundColor: M3.primaryContainer },
  tabText: { fontSize: 12, fontFamily: FONT.regular, fontWeight: '400', color: M3.onSurfaceVariant },
  tabTextActive: { color: M3.onPrimary },
  tabBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: M3.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeActive: { backgroundColor: M3.error },
  tabBadgeText: { fontSize: 11, fontFamily: FONT.regular, fontWeight: '400', color: M3.onSurfaceVariant },
  tabBadgeTextActive: { color: M3.onError },

  // List
  scroll: { flex: 1 },
  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 210, gap: 12 },

  // Select All card
  selectCard: {
    backgroundColor: M3.surfaceContainerLowest,
    borderRadius: 12,
    padding: 14,
    ...SHADOW.card,
  },
  selectMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bigCheck: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: M3.outline,
    backgroundColor: M3.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigCheckOn: { backgroundColor: M3.primary, borderColor: M3.primary },
  selectTitle: { fontSize: 13.5, fontFamily: FONT.regular, fontWeight: '400', color: M3.onSurface },
  selectSub: { fontSize: 12, color: M3.onSurfaceVariant, marginTop: 1, fontFamily: FONT.regular },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Banners
  noWa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: M3.errorContainer,
    borderRadius: 12,
    padding: 10,
  },
  noWaText: { flex: 1, fontSize: 12, color: M3.onErrorContainer, fontFamily: FONT.regular, lineHeight: 17 },
  errBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: M3.errorContainer,
    borderRadius: 12,
    padding: 10,
  },
  errText: { flex: 1, fontSize: 12, color: M3.onErrorContainer, fontFamily: FONT.regular },

  // Empty
  emptyCard: { alignItems: 'center', gap: 6, paddingVertical: 24, paddingHorizontal: 16 },
  emptyTitle: { fontSize: 13.5, fontFamily: FONT.regular, fontWeight: '400', color: M3.onSurface },
  emptyBody: {
    fontSize: 12,
    color: M3.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 17,
    fontFamily: FONT.regular,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    backgroundColor: M3.primary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  emptyBtnText: { color: M3.onPrimary, fontSize: 12, fontFamily: FONT.regular, fontWeight: '400' },

  // Student card
  rowCard: {
    backgroundColor: M3.surfaceContainerLowest,
    borderRadius: 12,
    padding: 16,
    position: 'relative',
    overflow: 'hidden',
    ...SHADOW.card,
  },
  stripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 6 },
  stripeError: { backgroundColor: M3.error },
  stripeTertiary: { backgroundColor: M3.tertiary },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: M3.outline,
    backgroundColor: M3.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: M3.primary, borderColor: M3.primary },
  rowAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: M3.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowAvatarText: { fontSize: 15, fontFamily: FONT.regular, fontWeight: '400', color: M3.onSurfaceVariant },
  rowNameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowName: { flexShrink: 1, fontSize: 13.5, fontFamily: FONT.regular, fontWeight: '400', color: M3.onSurface },
  rollChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: M3.surfaceContainerHigh,
  },
  rollChipText: { fontSize: 10, fontFamily: FONT.regular, fontWeight: '400', color: M3.onSurfaceVariant },
  rowClass: { fontSize: 12, color: M3.onSurfaceVariant, marginTop: 2, fontFamily: FONT.regular },

  // Status chips
  chipCol: { marginTop: 12, paddingTop: 12, gap: 10 },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  chipError: { backgroundColor: M3.errorContainer },
  chipTertiary: { backgroundColor: M3.tertiaryFixed },
  chipLow: { backgroundColor: M3.surfaceContainerLow },
  chipHigh: { backgroundColor: M3.surfaceContainerHigh },
  statChipText: { fontSize: 12, fontFamily: FONT.regular, fontWeight: '400' },
  chipTextError: { color: M3.onErrorContainer },
  chipTextTertiary: { color: M3.onTertiaryFixed },
  chipTextLow: { color: M3.onSurfaceVariant },

  // Contact box
  contactBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    backgroundColor: M3.surfaceContainerLow,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  contactIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: M3.secondaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactLabel: {
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontFamily: FONT.regular,
    fontWeight: '400',
    color: M3.onSurfaceVariant,
  },
  contactNumber: {
    fontSize: 13.5,
    fontFamily: FONT.regular,
    fontWeight: '400',
    color: M3.onSurface,
    marginTop: 1,
  },
  contactChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: M3.surfaceContainerHighest,
  },
  contactChipText: { fontSize: 11, fontFamily: FONT.regular, fontWeight: '400' },
  contactChipTextOn: { color: M3.secondary },
  contactChipTextAdd: { color: M3.primary },

  // Manage (fees)
  manageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: M3.primary,
    backgroundColor: M3.surfaceContainerLowest,
  },
  manageBtnText: { color: M3.primary, fontSize: 13, fontFamily: FONT.regular, fontWeight: '400' },

  // Sticky action bar
  actionWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  actionBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderRadius: 16,
    padding: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 10,
  },
  actionRow: { flex: 1, flexDirection: 'row', gap: 10 },
  waBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: M3.whatsapp,
  },
  waBtnText: { color: '#fff', fontSize: 13.5, fontFamily: FONT.regular, fontWeight: '400' },
  scheduleBtn: {
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: M3.surfaceContainerHigh,
  },
  scheduleBtnText: { fontSize: 12, fontFamily: FONT.regular, fontWeight: '400', color: M3.onSurface },
  btnOff: { opacity: 0.45 },
  queueRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 48,
  },
  queueText: { flex: 1, fontSize: 12, color: M3.onSurfaceVariant, fontFamily: FONT.regular },

  // Toast
  toastWrap: { position: 'absolute', top: 84, left: 0, right: 0, alignItems: 'center' },
  toastPill: {
    width: '100%',
    maxWidth: 416,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    backgroundColor: M3.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#00174b',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
  },
  toastTitle: { color: M3.onPrimary, fontSize: 13, fontFamily: FONT.regular, fontWeight: '400' },
  toastSub: { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 1, fontFamily: FONT.regular },

  // Modals
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: { backgroundColor: M3.surfaceContainerLowest, borderRadius: 16, padding: 16, gap: 8 },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  modalTitle: { fontSize: 17, fontFamily: FONT.regular, fontWeight: '400', color: M3.onSurface },
  modalLabel: {
    fontSize: 12,
    fontFamily: FONT.regular,
    fontWeight: '400',
    color: M3.onSurfaceVariant,
    marginTop: 6,
  },
  modalChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChipScroll: { flexGrow: 0 },
  filterChips: { gap: 8 },
  chip: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: M3.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: M3.primaryContainer },
  chipText: { fontSize: 12, fontFamily: FONT.regular, fontWeight: '400', color: M3.onSurfaceVariant },
  chipTextActive: { color: M3.onPrimary },
  modalDone: {
    alignItems: 'center',
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: M3.primary,
  },
  modalDoneText: { color: M3.onPrimary, fontSize: 13.5, fontFamily: FONT.regular, fontWeight: '400' },
  modalBody: { fontSize: 12, color: M3.onSurfaceVariant, lineHeight: 17, fontFamily: FONT.regular },
  scheduledBox: { marginTop: 4, gap: 4 },
  scheduledRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scheduledText: { flex: 1, fontSize: 11, color: M3.onSurfaceVariant, fontFamily: FONT.regular },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  modalCancel: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: M3.surfaceContainerLow,
  },
  modalCancelText: { fontSize: 13, fontFamily: FONT.regular, fontWeight: '400', color: M3.onSurfaceVariant },
  modalConfirm: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: M3.primary,
  },
  modalConfirmText: { fontSize: 13, fontFamily: FONT.regular, fontWeight: '400', color: M3.onPrimary },
  pressed: { opacity: 0.9 },
});
