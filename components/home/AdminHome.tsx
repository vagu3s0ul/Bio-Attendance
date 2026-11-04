import React, { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, FONT, RADIUS, SPACING } from '@/constants/theme';
import { IconTile, ListRow, Panel, Pill, QuickTile, SectionHeader, StatTile, type Tone } from '@/components/UI';
import { updateDeadline } from '@/services/api';
import { useSession } from '@/store/session';
import type { AdminStats, ClassStatus } from '@/types';

/** "09:30 AM" → 25 (minutes remaining today), or null when unparsable. */
function minutesLeft(deadline: string): number | null {
  const m = deadline.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (/pm/i.test(m[3] || '') && h < 12) h += 12;
  if (/am/i.test(m[3] || '') && h === 12) h = 0;
  const now = new Date();
  const target = new Date(now);
  target.setHours(h, mm, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 60000);
}

function lockHint(deadline: string): string {
  const mins = minutesLeft(deadline);
  if (mins === null) return 'Cutoff';
  if (mins <= 0) return 'Locked';
  if (mins < 60) return `${mins}m left`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m left` : `${h}h left`;
}

function sessionLabel(): string {
  const y = new Date().getFullYear();
  return `Academic Session ${y}-${String(y + 1).slice(2)}`;
}

export default function AdminHome({
  stats,
  classes,
  onReload,
}: {
  stats: AdminStats;
  classes: ClassStatus[];
  onReload: () => void;
}) {
  const router = useRouter();
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const PORTALS: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    subtitle: string;
    tone: Tone;
    badge?: string;
    badgeTone?: Tone;
    dot?: boolean;
    onPress: () => void;
  }[] = [
    { icon: 'create-outline', title: 'Daily Entry', subtitle: 'Mark attendance', tone: 'lavender', onPress: () => router.push('/(tabs)/entry') },
    { icon: 'scan-outline', title: 'Face ID', subtitle: 'Biometric', tone: 'sky', badge: 'FAST', badgeTone: 'sky', onPress: () => router.push('/face') },
    { icon: 'bar-chart-outline', title: 'Reports', subtitle: 'Analytics', tone: 'mint', onPress: () => router.push('/(tabs)/reports') },
    { icon: 'alert-circle-outline', title: 'Defaulters', subtitle: 'Follow ups', tone: 'rose', dot: true, onPress: () => router.push('/defaulters') },
    { icon: 'card-outline', title: 'Fee Dues', subtitle: 'Ledger', tone: 'peach', onPress: () => router.push('/fees') },
    { icon: 'people-circle-outline', title: 'Staff & Roster', subtitle: 'Directory', tone: 'violet', onPress: () => router.push('/manage') },
    { icon: 'time-outline', title: 'Audit Trail', subtitle: 'Timestamps', tone: 'slate', onPress: () => router.push('/web/audit') },
    { icon: 'download-outline', title: 'Export Data', subtitle: 'CSV packs', tone: 'sky', onPress: () => router.push('/web/export') },
    { icon: 'megaphone-outline', title: 'Notices', subtitle: 'Circulars', tone: 'mint', onPress: () => router.push('/notices') },
  ];

  const enteredTotal = classes.reduce((sum, c) => sum + c.entered, 0);
  const present = enteredTotal > 0 ? enteredTotal : stats.todayEntries;
  const absent = Math.max(stats.students - present, 0);
  const presentPct = stats.students > 0 ? Math.round((present / stats.students) * 100) : 0;
  const pending = classes.filter((c) => c.status !== 'Done');
  const pendingNames = pending
    .slice(0, 3)
    .map((c) => c.className.replace(/^Class\s*/i, ''))
    .join(', ');

  const openEditor = () => {
    setTime(stats.deadline || '09:30');
    setErr(null);
    setOpen(true);
  };

  const save = async () => {
    if (!/^\d{1,2}:\d{2}$/.test(time.trim())) {
      setErr('Enter time as HH:MM (24-hour), e.g. 09:30.');
      return;
    }
    setBusy(true);
    try {
      const res = await updateDeadline(time.trim());
      if (res.ok) {
        setOpen(false);
        onReload();
      } else {
        setErr(res.message);
      }
    } catch (e: any) {
      setErr(e?.message || 'Could not update the deadline.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      {/* Control panel */}
      <Panel style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.liveWrap}>
            <View style={styles.liveDot} />
            <Text style={styles.liveLabel}>CAMPUS OPERATIONAL</Text>
          </View>
          <Pressable onPress={openEditor} style={styles.heroBell} hitSlop={8}>
            <Ionicons name="notifications-outline" size={19} color={COLORS.text} />
          </Pressable>
        </View>

        <Text style={styles.heroTitle} numberOfLines={2}>
          Assalam-o-Alaikum, {user?.name || 'Admin'}
        </Text>
        <Text style={styles.heroSub}>{sessionLabel()}</Text>

        <Pressable onPress={openEditor} style={styles.lockBanner}>
          <IconTile icon="time-outline" tone="peach" size={36} radius={12} iconSize={18} />
          <View style={styles.flex}>
            <Text style={styles.lockTitle} numberOfLines={1}>
              Attendance Lock Time: {stats.deadline || '09:30 AM'}
            </Text>
            <Text style={styles.lockSub} numberOfLines={1}>
              Strict cutoff enforced campus-wide
            </Text>
          </View>
          <View style={styles.lockPill}>
            <Text style={styles.lockPillText}>{lockHint(stats.deadline)}</Text>
          </View>
        </Pressable>
      </Panel>

      {/* Bento stats */}
      <View style={styles.grid}>
        <View style={styles.gridRow}>
          <StatTile
            label="Total Students"
            value={stats.students.toLocaleString()}
            sub={`${classes.length || stats.classes} active sections`}
            icon="people-outline"
            tone="lavender"
          />
          <StatTile
            label="Present Today"
            value={present.toLocaleString()}
            sub="Marks recorded"
            icon="checkmark-circle-outline"
            tone="sky"
            badge={`${presentPct}%`}
            badgeTone="sky"
          />
        </View>
        <View style={styles.gridRow}>
          <StatTile
            label="Absent Today"
            value={absent.toLocaleString()}
            sub="Awaiting review"
            icon="close-circle-outline"
            tone="rose"
            badge="Alert"
            badgeTone="rose"
          />
          <StatTile
            label="Pending Entry"
            value={`${pending.length} ${pending.length === 1 ? 'Class' : 'Classes'}`}
            sub={pendingNames || 'All classes submitted'}
            icon="timer-outline"
            tone="peach"
          />
        </View>
      </View>

      {/* Portals */}
      <SectionHeader
        title="Quick Administrative Actions"
        sub="Fast dispatch modules"
        action={`${PORTALS.length} Portals`}
        style={styles.section}
      />
      <View style={styles.portalGrid}>
        {[0, 3, 6].map((start) => (
          <View key={start} style={styles.gridRow}>
            {PORTALS.slice(start, start + 3).map((p) => (
              <QuickTile
                key={p.title}
                icon={p.icon}
                title={p.title}
                subtitle={p.subtitle}
                tone={p.tone}
                badge={p.badge}
                badgeTone={p.badgeTone}
                dot={p.dot}
                onPress={p.onPress}
              />
            ))}
          </View>
        ))}
      </View>

      {/* Live class status */}
      <SectionHeader
        title="Recent Live Activity"
        action="View All"
        onAction={() => router.push('/(tabs)/reports')}
        style={styles.section}
      />
      <Panel style={styles.activity}>
        {classes.length === 0 ? (
          <Text style={styles.empty}>No class activity recorded yet today.</Text>
        ) : (
          classes.slice(0, 4).map((c, i, arr) => (
            <ListRow
              key={`${c.className}-${i}`}
              icon={c.status === 'Done' ? 'checkmark-done-outline' : 'alert-circle-outline'}
              tone={c.status === 'Done' ? 'mint' : c.status === 'Not Done' ? 'rose' : 'peach'}
              title={`${c.className} Attendance Logged`}
              sub={`${c.teacher} • ${c.entered}/${c.students} Present`}
              right={c.status}
              last={i === arr.length - 1}
              onPress={() =>
                router.push({ pathname: '/web/[page]', params: { page: 'reports' } })
              }
            />
          ))
        )}
      </Panel>

      {/* Deadline editor */}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Attendance Deadline</Text>
            <Text style={styles.modalSub}>Entries saved after this time are marked LATE.</Text>
            <TextInput
              style={styles.modalInput}
              value={time}
              onChangeText={setTime}
              placeholder="09:30"
              placeholderTextColor={COLORS.textFaint}
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {err ? <Text style={styles.modalErr}>{err}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setOpen(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.modalSave,
                  pressed && styles.pressed,
                  busy && styles.busy,
                ]}
                onPress={save}
                disabled={busy}
              >
                <Text style={styles.modalSaveText}>{busy ? 'Saving…' : 'Save'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: SPACING.lg },
  flex: { flex: 1 },
  hero: { gap: 8 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.primary },
  liveLabel: {
    fontSize: 11,
    letterSpacing: 0.8,
    fontFamily: FONT.medium,
    fontWeight: '600',
    color: COLORS.primary,
  },
  heroBell: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.field,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontSize: 21,
    fontFamily: FONT.bold,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.4,
  },
  heroSub: { fontSize: 13, color: COLORS.textMuted, fontFamily: FONT.regular },
  lockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    backgroundColor: COLORS.peachSoft,
    borderRadius: 16,
    padding: 10,
  },
  lockTitle: { fontSize: 13.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  lockSub: { fontSize: 11.5, color: COLORS.neutralChipText, marginTop: 1, fontFamily: FONT.regular },
  lockPill: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  lockPillText: { fontSize: 11.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },

  grid: { gap: SPACING.md },
  gridRow: { flexDirection: 'row', gap: SPACING.md },
  section: { marginTop: 4 },
  portalGrid: { gap: SPACING.md },
  activity: { paddingVertical: 4 },
  empty: { fontSize: 13, color: COLORS.textMuted, fontFamily: FONT.regular, paddingVertical: 10 },

  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    alignSelf: 'stretch',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: 20,
    gap: 8,
  },
  modalTitle: { fontSize: 18, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  modalSub: { fontSize: 13, color: COLORS.textMuted, fontFamily: FONT.regular, lineHeight: 18 },
  modalInput: {
    height: 52,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.field,
    fontFamily: FONT.regular,
    marginTop: 6,
  },
  modalErr: { fontSize: 12, color: COLORS.danger, fontFamily: FONT.regular },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  modalCancel: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.chipIdle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: { color: COLORS.text, fontSize: 14, fontFamily: FONT.medium, fontWeight: '600' },
  modalSave: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveText: { color: '#fff', fontSize: 14, fontFamily: FONT.medium, fontWeight: '600' },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  busy: { opacity: 0.7 },
});
