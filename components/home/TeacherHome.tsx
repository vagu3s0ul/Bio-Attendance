import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { COLORS, FONT, SHADOW, SPACING } from '@/constants/theme';
import { IconTile, ListRow, Panel, Pill, QuickTile, SectionHeader } from '@/components/UI';
import { useSession } from '@/store/session';
import { fetchEntry, fetchFaceRoster } from '@/services/api';
import type { TeacherStats } from '@/types';
import { SessionExpiredError } from '@/types';

/** Teacher desk home — attendance card, roster, face actions, tools, sync row. */
export default function TeacherHome({
  stats,
  onSync,
}: {
  stats: TeacherStats;
  onSync: () => void;
}) {
  const router = useRouter();
  const [entryPresent, setEntryPresent] = React.useState<number | null>(null);
  const [entryAbsent, setEntryAbsent] = React.useState<number | null>(null);
  const [lastSyncAt, setLastSyncAt] = React.useState<number>(() => Date.now());
  const [enrollBusy, setEnrollBusy] = React.useState(false);

  // Roster counts come from today's entry. They are re-fetched every time
  // this tab regains focus (returning from Entry or Face shows the latest
  // counts) and from the Refresh button — a mount-only fetch left them
  // frozen at whatever the entry said when Home first opened.
  const loadEntryCounts = React.useCallback(async () => {
    try {
      const form = await fetchEntry();
      setEntryPresent(form.students.filter((s) => s.absent === false).length);
      setEntryAbsent(form.students.filter((s) => s.absent === true).length);
      setLastSyncAt(Date.now());
    } catch {
      // fall back to stats.entered
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadEntryCounts();
    }, [loadEntryCounts])
  );

  // Refresh reloads the roster counts too, not just the home stats.
  const handleRefresh = React.useCallback(() => {
    loadEntryCounts();
    onSync();
  }, [loadEntryCounts, onSync]);

  // Keep the "updated just now" label fresh when the parent hands us new stats.
  React.useEffect(() => {
    setLastSyncAt(Date.now());
  }, [stats]);

  // Enroll Face opens on the first student whose face is not enrolled yet,
  // with the rest of the unenrolled students queued behind them — the same
  // as the Enroll button on the Face Attendance screen. A bare push to
  // /face/enroll opens blank (no student linked), so never do that.
  const openEnroll = React.useCallback(async () => {
    if (enrollBusy) return;
    setEnrollBusy(true);
    try {
      const roster = await fetchFaceRoster();
      if (!roster || (roster.total ?? 0) === 0) {
        Alert.alert('No students', 'No students found in your class.');
        return;
      }
      const queue = (roster.students ?? []).filter((s) => s.samples === 0);
      if (queue.length === 0) {
        Alert.alert(
          'All enrolled',
          'Every student in this class already has a face enrolled.'
        );
        return;
      }
      router.push({
        pathname: '/face/enroll',
        params: {
          roll: queue[0].roll,
          name: queue[0].name,
          className: roster.class,
          samples: '0',
          queue: JSON.stringify(queue.map((s) => ({ roll: s.roll, name: s.name }))),
          qi: '0',
        },
      });
    } catch (e: any) {
      if (e instanceof SessionExpiredError) {
        Alert.alert('Session expired', 'Please log in again.');
        router.replace('/(auth)/login');
        return;
      }
      Alert.alert("Couldn't load faces", e?.message || 'Check your connection.');
    } finally {
      setEnrollBusy(false);
    }
  }, [enrollBusy, router]);

  const { user } = useSession();
  const name = user?.name || user?.username || 'Teacher';
  const first = name.split(' ')[0];
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const present = entryPresent ?? stats.entered;
  // Only students explicitly marked absent count as absent — everyone else
  // still to be marked is "To Mark", not absent.
  const absent = entryAbsent ?? 0;
  const toMark = Math.max(stats.total - present - absent, 0);
  const pct = stats.total > 0 ? Math.round((stats.entered / stats.total) * 100) : 0;
  const presentPct = stats.total > 0 ? Math.round((present / stats.total) * 100) : 0;
  const done = stats.total > 0 && stats.entered >= stats.total;

  const syncLabel = (() => {
    const mins = Math.floor((Date.now() - lastSyncAt) / 60000);
    if (mins < 1) return 'Roster updated just now';
    if (mins < 60) return `Roster updated ${mins} min ago`;
    return `Roster updated ${Math.floor(mins / 60)}h ago`;
  })();

  return (
    <View style={styles.root}>
      {/* Greeting */}
      <View style={styles.greetRow}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={22} color={COLORS.primary} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.greet} numberOfLines={1}>
            Assalam-o-Alaikum, {first}
          </Text>
          <Text style={styles.greetSub} numberOfLines={1}>
            Class Teacher • Daily checking desk
          </Text>
        </View>
      </View>

      {/* Attendance card */}
      <Panel style={styles.classCard}>
        <View style={styles.classTop}>
          <Pill
            label={done ? 'ENTRY COMPLETE' : 'PENDING ENTRY'}
            tone={done ? 'mint' : 'rose'}
            solid
          />
          <Text style={styles.periodText}>{today}</Text>
          <View style={styles.flex} />
          <Ionicons name="alarm-outline" size={13} color={COLORS.danger} />
          <Text style={styles.cutoff}>Cutoff {stats.deadline || '09:30'}</Text>
        </View>

        <Text style={styles.classTitle}>
          {stats.total > 0 ? `${stats.entered}/${stats.total} students marked` : 'No class assigned'}
        </Text>

        <Pressable
          onPress={() => router.push('/(tabs)/entry')}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
        >
          <Ionicons name="create-outline" size={18} color="#fff" />
          <Text style={styles.primaryBtnText}>
            {done ? 'Review Attendance' : 'Mark Attendance'}
          </Text>
          <View style={styles.flex} />
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </Pressable>
      </Panel>

      {/* Class Roster */}
      <Panel style={styles.pulse}>
        <View style={styles.pulseHead}>
          <Ionicons name="pulse-outline" size={17} color={COLORS.primary} />
          <Text style={styles.pulseTitle}>Class Roster</Text>
          <View style={styles.flex} />
          <Pill label="Today" tone="slate" />
        </View>

        <View style={styles.pulseCounters}>
          <View style={styles.pulseCell}>
            <View style={styles.pulseTop}>
              <Ionicons name="checkmark-circle-outline" size={14} color={COLORS.primary} />
              <Text style={styles.pulseLabel}>Present</Text>
            </View>
            <Text style={styles.pulseValue}>{present}</Text>
            <Text style={styles.pulseSub}>{presentPct}% of class</Text>
          </View>
          <View style={styles.pulseCell}>
            <View style={styles.pulseTop}>
              <Ionicons name="time-outline" size={14} color={COLORS.warning} />
              <Text style={styles.pulseLabel}>To Mark</Text>
            </View>
            <Text style={[styles.pulseValue, { color: COLORS.warning }]}>{toMark}</Text>
            <Text style={styles.pulseSub}>Not yet marked</Text>
          </View>
          <View style={styles.pulseCell}>
            <View style={styles.pulseTop}>
              <Ionicons name="close-circle-outline" size={14} color={COLORS.danger} />
              <Text style={styles.pulseLabel}>Absent</Text>
            </View>
            <Text style={[styles.pulseValue, { color: COLORS.danger }]}>{absent}</Text>
            <Text style={styles.pulseSub}>Marked absent</Text>
          </View>
        </View>

        <View style={styles.pulseTrack}>
          <View style={[styles.pulseFill, { width: `${Math.min(pct, 100)}%` }]} />
        </View>
      </Panel>

      {/* Face Attendance */}
      <Pressable
        onPress={() => router.push('/face')}
        style={({ pressed }) => [styles.faceRow, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Face Attendance"
      >
        <IconTile
          icon="scan-outline"
          tone="lavender"
          size={44}
          radius={14}
          iconSize={22}
          style={{ backgroundColor: '#FFFFFF' }}
        />
        <View style={styles.flex}>
          <Text style={styles.faceRowTitle}>Face Attendance</Text>
          <Text style={styles.faceRowSub}>Biometric batch camera</Text>
        </View>
        <Pill label="FAST" tone="sky" />
        <Ionicons name="chevron-forward" size={17} color={COLORS.primary} />
      </Pressable>

      {/* Enroll Face */}
      <Pressable
        onPress={openEnroll}
        disabled={enrollBusy}
        style={({ pressed }) => [
          styles.enrollRow,
          pressed && !enrollBusy && styles.pressed,
          enrollBusy && styles.enrollBusy,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Enroll Face"
      >
        <IconTile icon="person-add-outline" tone="lavender" size={44} radius={14} iconSize={22} />
        <View style={styles.flex}>
          <Text style={styles.enrollRowTitle}>Enroll Face</Text>
          <Text style={styles.enrollRowSub}>Register a student's face</Text>
        </View>
        <Ionicons name="chevron-forward" size={17} color={COLORS.primary} />
      </Pressable>

      {/* Daily Tools */}
      <SectionHeader title="Daily Tools" style={styles.section} />
      <View style={styles.gridRow}>
        <QuickTile
          icon="create-outline"
          title="Manual Attendance"
          subtitle="Mark by hand"
          tone="lavender"
          columns={3}
          centered
          onPress={() => router.push('/(tabs)/entry')}
        />
        <QuickTile
          icon="bar-chart-outline"
          title="Class Reports"
          subtitle="Monthly trend"
          tone="lavender"
          columns={3}
          centered
          onPress={() => router.push('/(tabs)/reports')}
        />
        <QuickTile
          icon="card-outline"
          title="Fee Dues"
          subtitle="Admin ledger audit"
          tone="peach"
          columns={3}
          centered
          onPress={() => router.push('/fees')}
        />
      </View>

      {/* Flagged student concerns */}
      <Panel>
        <ListRow
          icon="alert-circle-outline"
          tone="rose"
          title="Flagged student concerns"
          sub="Uniform, grooming & absence follow-ups"
          right="Open"
          onPress={() => router.push('/defaulters')}
          last
        />
      </Panel>

      {/* More tools */}
      <Text style={styles.moreLabel}>More tools</Text>
      <View style={styles.gridRow}>
        <QuickTile
          icon="alert-circle-outline"
          title="Attendance Defaulters"
          tone="rose"
          columns={3}
          centered
          onPress={() => router.push('/defaulters')}
        />
        <QuickTile
          icon="download-outline"
          title="Export"
          tone="sky"
          columns={3}
          centered
          onPress={() => router.push('/web/export')}
        />
        <QuickTile
          icon="megaphone-outline"
          title="Notices"
          tone="mint"
          columns={3}
          centered
          onPress={() => router.push('/notices')}
        />
      </View>

      {/* Sync */}
      <View style={styles.syncRow}>
        <IconTile icon="sync-outline" tone="slate" size={38} radius={12} iconSize={18} />
        <View style={styles.flex}>
          <Text style={styles.syncTitle}>{syncLabel}</Text>
          <Text style={styles.syncSub}>Latest roster & entries</Text>
        </View>
        <Pressable
          onPress={handleRefresh}
          style={({ pressed }) => [styles.syncBtn, pressed && styles.pressed]}
        >
          <Text style={styles.syncBtnText}>Refresh</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: SPACING.md },
  flex: { flex: 1 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  enrollBusy: { opacity: 0.6 },

  greetRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  greet: { fontSize: 18, fontFamily: FONT.display, fontWeight: '300', color: COLORS.text },
  greetSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2, fontFamily: FONT.regular },

  classCard: { gap: 10 },
  classTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  periodText: { fontSize: 11.5, color: COLORS.textMuted, fontFamily: FONT.regular },
  cutoff: { fontSize: 11.5, color: COLORS.danger, fontFamily: FONT.medium, fontWeight: '600' },
  classTitle: {
    fontSize: 24,
    fontFamily: FONT.display,
    fontWeight: '300',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 54,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    ...SHADOW.lifted,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontFamily: FONT.medium, fontWeight: '600' },

  pulse: { gap: 10 },
  pulseHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pulseTitle: { fontSize: 15.5, fontFamily: FONT.regular, fontWeight: '400', color: COLORS.text },
  pulseCounters: { flexDirection: 'row', gap: 8 },
  pulseCell: { flex: 1, backgroundColor: COLORS.field, borderRadius: 14, padding: 10, gap: 2 },
  pulseTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pulseLabel: { fontSize: 11.5, color: COLORS.textMuted, fontFamily: FONT.regular },
  pulseValue: { fontSize: 22, fontFamily: FONT.display, fontWeight: '300', color: COLORS.text },
  pulseSub: { fontSize: 10.5, color: COLORS.textFaint, fontFamily: FONT.regular },
  pulseTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.field,
    overflow: 'hidden',
  },
  pulseFill: { height: '100%', borderRadius: 4, backgroundColor: COLORS.primary },

  faceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.primarySoft,
    borderRadius: 16,
    padding: 14,
  },
  faceRowTitle: { fontSize: 15, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  faceRowSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 1, fontFamily: FONT.regular },
  enrollRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: 16,
    padding: 14,
  },
  enrollRowTitle: { fontSize: 15, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.primary },
  enrollRowSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 1, fontFamily: FONT.regular },

  section: { marginTop: 6 },
  gridRow: { flexDirection: 'row', gap: SPACING.md },
  moreLabel: { fontSize: 13, color: COLORS.textMuted, fontFamily: FONT.regular, marginTop: 6 },

  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.field,
    borderRadius: 16,
    padding: 12,
  },
  syncTitle: { fontSize: 13, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  syncSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 2, fontFamily: FONT.regular },
  syncBtn: {
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 11,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncBtnText: { fontSize: 12.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.primary },
});
