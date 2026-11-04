import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, FONT, RADIUS, SHADOW, SPACING } from '@/constants/theme';
import { IconTile, ListRow, Panel, Pill, QuickTile, SectionHeader } from '@/components/UI';
import { useSession } from '@/store/session';
import type { TeacherStats } from '@/types';

/** Teacher desk home — attendance card, roster pulse, quick tools, sync row. */
export default function TeacherHome({
  stats,
  onSync,
}: {
  stats: TeacherStats;
  onSync: () => void;
}) {
  const router = useRouter();
  const { user } = useSession();
  const name = user?.name || user?.username || 'Teacher';
  const first = name.split(' ')[0];
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const present = stats.entered;
  const absent = Math.max(stats.total - stats.entered, 0);
  const pct = stats.total > 0 ? Math.round((stats.entered / stats.total) * 100) : 0;
  const done = stats.total > 0 && stats.entered >= stats.total;

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
        <Pressable
          onPress={() => router.push('/(tabs)/entry')}
          style={({ pressed }) => [styles.calBtn, pressed && styles.pressed]}
        >
          <Ionicons name="calendar-outline" size={19} color={COLORS.text} />
        </Pressable>
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

        <View style={styles.miniRow}>
          <View style={styles.miniTile}>
            <IconTile icon="people-outline" tone="lavender" size={30} radius={9} iconSize={15} />
            <View style={styles.flex}>
              <Text style={styles.miniLabel}>Registered</Text>
              <Text style={styles.miniValue}>{stats.totalStudents} Students</Text>
            </View>
          </View>
          <View style={styles.miniTile}>
            <IconTile icon="checkmark-circle-outline" tone="sky" size={30} radius={9} iconSize={15} />
            <View style={styles.flex}>
              <Text style={styles.miniLabel}>Marked today</Text>
              <Text style={styles.miniValue}>
                {present}/{stats.total} ({pct}%)
              </Text>
            </View>
          </View>
        </View>

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

      {/* Roster pulse */}
      <Panel style={styles.pulse}>
        <View style={styles.pulseHead}>
          <Ionicons name="pulse-outline" size={17} color={COLORS.primary} />
          <Text style={styles.pulseTitle}>Class Roster Pulse</Text>
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
            <Text style={styles.pulseSub}>{pct}% expected</Text>
          </View>
          <View style={styles.pulseCell}>
            <View style={styles.pulseTop}>
              <Ionicons name="close-circle-outline" size={14} color={COLORS.danger} />
              <Text style={styles.pulseLabel}>Absent</Text>
            </View>
            <Text style={[styles.pulseValue, { color: COLORS.danger }]}>{absent}</Text>
            <Text style={styles.pulseSub}>Unmarked</Text>
          </View>
          <View style={styles.pulseCell}>
            <View style={styles.pulseTop}>
              <Ionicons name="time-outline" size={14} color={COLORS.warning} />
              <Text style={styles.pulseLabel}>Days</Text>
            </View>
            <Text style={styles.pulseValue}>{stats.daysThisMonth}</Text>
            <Text style={styles.pulseSub}>This month</Text>
          </View>
        </View>

        <View style={styles.pulseTrack}>
          <View style={[styles.pulseFill, { width: `${Math.min(pct, 100)}%` }]} />
        </View>

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

      {/* Tools */}
      <SectionHeader title="Teacher Desk & Tools" action="Quick Shortcuts" style={styles.section} />
      <View style={styles.grid}>
        <View style={styles.gridRow}>
          <QuickTile
            icon="create-outline"
            title="Daily Entry"
            subtitle="Manual attendance entry"
            tone="lavender"
            columns={2}
            onPress={() => router.push('/(tabs)/entry')}
          />
          <QuickTile
            icon="scan-outline"
            title="Face ID Scan"
            subtitle="Biometric batch camera"
            tone="sky"
            badge="FAST"
            badgeTone="sky"
            columns={2}
            onPress={() => router.push('/face')}
          />
        </View>
        <View style={styles.gridRow}>
          <QuickTile
            icon="bar-chart-outline"
            title="Class Reports"
            subtitle="Monthly attendance trend"
            tone="lavender"
            columns={2}
            onPress={() => router.push('/(tabs)/reports')}
          />
          <QuickTile
            icon="alert-circle-outline"
            title="Defaulter Alerts"
            subtitle="Repeated absences"
            tone="rose"
            dot
            columns={2}
            onPress={() => router.push('/defaulters')}
          />
        </View>
        <View style={styles.gridRow}>
          <QuickTile
            icon="card-outline"
            title="Fee Dues"
            subtitle="Admin ledger audit"
            tone="peach"
            badge="View-Only"
            badgeTone="slate"
            columns={2}
            onPress={() => router.push('/fees')}
          />
          <QuickTile
            icon="download-outline"
            title="Export Class Data"
            subtitle="CSV & sheet packs"
            tone="sky"
            columns={2}
            onPress={() => router.push('/web/export')}
          />
        </View>
        <View style={styles.gridRow}>
          <QuickTile
            icon="megaphone-outline"
            title="Notices"
            subtitle="Staff circulars & exams"
            tone="mint"
            columns={2}
            onPress={() => router.push('/notices')}
          />
          <QuickTile
            icon="globe-outline"
            title="Online Dashboard"
            subtitle="Full web dashboard"
            tone="slate"
            columns={2}
            onPress={() => router.push('/web/dashboard')}
          />
        </View>
      </View>

      {/* Sync */}
      <View style={styles.syncRow}>
        <IconTile icon="sync-outline" tone="slate" size={38} radius={12} iconSize={18} />
        <View style={styles.flex}>
          <Text style={styles.syncTitle}>Sialkot Main Server Synchronized</Text>
          <Text style={styles.syncSub}>Pull the latest roster & entries</Text>
        </View>
        <Pressable
          onPress={onSync}
          style={({ pressed }) => [styles.syncBtn, pressed && styles.pressed]}
        >
          <Text style={styles.syncBtnText}>Sync</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: SPACING.md },
  flex: { flex: 1 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },

  greetRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  greet: { fontSize: 18, fontFamily: FONT.bold, fontWeight: '700', color: COLORS.text },
  greetSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2, fontFamily: FONT.regular },
  calBtn: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: COLORS.chipIdle,
    alignItems: 'center',
    justifyContent: 'center',
  },

  classCard: { gap: 10 },
  classTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  periodText: { fontSize: 11.5, color: COLORS.textMuted, fontFamily: FONT.regular },
  cutoff: { fontSize: 11.5, color: COLORS.danger, fontFamily: FONT.medium, fontWeight: '600' },
  classTitle: {
    fontSize: 19,
    fontFamily: FONT.bold,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  miniRow: { flexDirection: 'row', gap: 8 },
  miniTile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.field,
    borderRadius: 12,
    padding: 8,
  },
  miniLabel: { fontSize: 10.5, color: COLORS.textMuted, fontFamily: FONT.regular },
  miniValue: { fontSize: 12.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
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
  pulseTitle: { fontSize: 15.5, fontFamily: FONT.bold, fontWeight: '700', color: COLORS.text },
  pulseCounters: { flexDirection: 'row', gap: 8 },
  pulseCell: { flex: 1, backgroundColor: COLORS.field, borderRadius: 14, padding: 10, gap: 2 },
  pulseTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pulseLabel: { fontSize: 11.5, color: COLORS.textMuted, fontFamily: FONT.regular },
  pulseValue: { fontSize: 22, fontFamily: FONT.bold, fontWeight: '700', color: COLORS.text },
  pulseSub: { fontSize: 10.5, color: COLORS.textFaint, fontFamily: FONT.regular },
  pulseTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.field,
    overflow: 'hidden',
  },
  pulseFill: { height: '100%', borderRadius: 4, backgroundColor: COLORS.primary },

  section: { marginTop: 6 },
  grid: { gap: SPACING.md },
  gridRow: { flexDirection: 'row', gap: SPACING.md },

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
