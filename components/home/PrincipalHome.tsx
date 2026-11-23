import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { COLORS, FONT, RADIUS, SPACING } from '@/constants/theme';
import { IconTile, Panel, Pill, QuickTile, SectionHeader } from '@/components/UI';
import { useSession } from '@/store/session';
import { fetchNotices, Notice } from '@/services/api';
import type { AdminStats, ClassStatus } from '@/types';

function yearLabel(): string {
  const y = new Date().getFullYear();
  return `AY ${y}-${String(y + 1).slice(2)}`;
}

/** Relative stamp for notice cards: "08:15 AM" / "Yesterday" / "2d ago". */
function relTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  }
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  const days = Math.max(Math.floor((now.getTime() - d.getTime()) / 86400000), 1);
  return `${days}d ago`;
}

/** Principal command desk: campus health, executive directives, wing review, oversight. */
export default function PrincipalHome({
  stats,
  classes,
  onSync,
  onOpenTab,
}: {
  stats?: AdminStats;
  classes?: ClassStatus[];
  onSync: () => void;
  onOpenTab?: (tab: 'attendance' | 'classes', filter?: 'absent' | 'present') => void;
}) {
  const router = useRouter();
  const { user } = useSession();
  const roster = classes ?? [];
  const totalStudents = stats?.students ?? roster.reduce((sum, c) => sum + c.entered, 0);
  const presentTotal = roster.reduce((sum, c) => sum + c.entered, 0);
  const presentPct = totalStudents > 0 ? Math.round((presentTotal / totalStudents) * 100) : 0;
  const absentTotal = Math.max(totalStudents - presentTotal, 0);
  const absentPct = 100 - presentPct;
  const secCount = stats?.classes ?? roster.length;

  const locked = roster.filter((c) => c.status === 'Done').length;
  const classTotal = roster.length || stats?.classes || 0;
  const pendingCount = Math.max(classTotal - locked, 0);

  const [notices, setNotices] = useState<Notice[]>([]);
  const unread = notices.filter((n) => !n.read).length;
  const top = notices.find((n) => !n.read) ?? notices[0];

  const loadNotices = useCallback(async () => {
    try {
      setNotices(await fetchNotices());
    } catch {
      // Home must render even if the notices feed is down.
    }
  }, []);

  useEffect(() => {
    void loadNotices();
  }, [loadNotices]);

  const verifyCutoff = () => {
    Alert.alert(
      'Cutoff Enforced',
      'Attendance records are sealed after the morning cutoff. Late entries require secretariat sign-off before they are stamped.'
    );
  };

  const wingRows = [...roster]
    .sort((a, b) => {
      const pa = a.students > 0 ? a.entered / a.students : 0;
      const pb = b.students > 0 ? b.entered / b.students : 0;
      return pb - pa;
    })
    .slice(0, 3);

  return (
    <View style={styles.root}>
      {/* Executive profile */}
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={20} color={COLORS.primary} />
            <View style={styles.statusDot} />
          </View>
          <View style={styles.flex}>
            <View style={styles.badgePill}>
              <Ionicons name="shield-checkmark" size={12} color={COLORS.primary} />
              <Text style={styles.badgeText}>DIRECTOR SECRETARIAT</Text>
            </View>
          </View>
          <View style={styles.ayPill}>
            <Text style={styles.ayText}>{yearLabel()}</Text>
          </View>
        </View>
        <Text style={styles.heroName}>Assalam-o-Alaikum, {user?.name || 'Sir'}</Text>
        <Text style={styles.heroRole}>Principal • Sialkot Campus</Text>
      </View>

      {/* Cutoff banner */}
      <View style={styles.cutoff}>
        <View style={styles.cutoffTop}>
          <IconTile icon="lock-closed-outline" tone="lavender" size={38} radius={12} iconSize={18} />
          <View style={styles.flex}>
            <View style={styles.cutoffTitleRow}>
              <View style={styles.dot} />
              <Text style={styles.cutoffTitle} numberOfLines={1}>
                Attendance Cutoff Locked
              </Text>
            </View>
            <Text style={styles.cutoffSub} numberOfLines={1}>
              Ledger sealed after morning cutoff
            </Text>
          </View>
          <Pill label="Stamped" tone="mint" />
        </View>
        <Pressable
          onPress={verifyCutoff}
          style={({ pressed }) => [styles.verifyBtn, pressed && styles.pressed]}
        >
          <Ionicons name="shield-checkmark" size={13} color={COLORS.primary} />
          <Text style={styles.verifyText}>Verify Ledger</Text>
        </Pressable>
      </View>

      {/* Campus Enrollment Health */}
      <SectionHeader title="Campus Enrollment Health" sub="Live master ledger" style={styles.section} />
      <View style={styles.gridRow}>
        <Pressable
          onPress={() => onOpenTab?.('classes')}
          style={({ pressed }) => [styles.metric, pressed && styles.pressed]}
        >
          <View style={styles.metricTop}>
            <Text style={styles.metricLabel}>Total Enrolled</Text>
            <IconTile icon="people-outline" tone="lavender" size={28} radius={9} iconSize={14} />
          </View>
          <Text style={styles.metricValue}>{totalStudents.toLocaleString()}</Text>
          <Text style={styles.metricSub}>Students across {secCount} Sec ›</Text>
        </Pressable>

        <Pressable
          onPress={() => onOpenTab?.('attendance', 'present')}
          style={({ pressed }) => [styles.metric, pressed && styles.pressed]}
        >
          <View style={styles.metricTop}>
            <Text style={styles.metricLabel}>Present Today</Text>
            <Pill label={`${presentPct}%`} tone="mint" solid />
          </View>
          <Text style={styles.metricValue}>{presentTotal.toLocaleString()}</Text>
          <Text style={styles.metricSub}>of {totalStudents.toLocaleString()} enrolled ›</Text>
          <View style={styles.metricTrack}>
            <View style={[styles.metricFill, { width: `${Math.min(presentPct, 100)}%` }]} />
          </View>
        </Pressable>
      </View>
      <View style={styles.gridRow}>
        <Pressable
          onPress={() => onOpenTab?.('attendance', 'absent')}
          style={({ pressed }) => [styles.metric, pressed && styles.pressed]}
        >
          <View style={styles.metricTop}>
            <Text style={styles.metricLabel}>Absentees</Text>
            <IconTile icon="person-remove" tone="rose" size={28} radius={9} iconSize={14} />
          </View>
          <Text style={[styles.metricValue, { color: COLORS.danger }]}>{absentTotal}</Text>
          <Text style={styles.metricSub}>{absentPct}% campus-wide follow-up ›</Text>
        </Pressable>

        <Pressable
          onPress={() => onOpenTab?.('classes')}
          style={({ pressed }) => [styles.metric, pressed && styles.pressed]}
        >
          <View style={styles.metricTop}>
            <Text style={styles.metricLabel}>Locking Progress</Text>
            <IconTile icon="hammer-outline" tone="peach" size={28} radius={9} iconSize={14} />
          </View>
          <View style={styles.metricValueRow}>
            <Text style={styles.metricValue}>{locked}</Text>
            <Text style={styles.metricOf}>/ {classTotal}</Text>
          </View>
          <Text style={styles.metricSub}>{pendingCount} Pending Review ›</Text>
        </Pressable>
      </View>

      {/* Executive Directives */}
      <View style={styles.directiveHead}>
        <IconTile icon="megaphone-outline" tone="lavender" size={38} radius={12} iconSize={18} />
        <View style={styles.flex}>
          <Text style={styles.directiveTitle}>Executive Directives</Text>
          <Text style={styles.directiveSub}>Campus-wide circulars &amp; orders</Text>
        </View>
        {unread > 0 ? (
          <Pill label={`${unread} Pending`} tone="rose" solid />
        ) : (
          <Pill label="All Read" tone="mint" />
        )}
      </View>
      <Panel style={styles.directiveCard}>
        <Pressable
          onPress={() => router.push('/notices')}
          style={({ pressed }) => [styles.directiveInner, pressed && styles.pressed]}
        >
          <View style={styles.flex}>
            <Text style={styles.directiveLabel}>{unread > 0 ? 'URGENT COMPLIANCE' : 'CAMPUS DIRECTIVE'}</Text>
            <Text style={styles.directiveName} numberOfLines={2}>
              {top ? top.subject || '(no subject)' : 'No circulars pending'}
            </Text>
            <Text style={styles.directiveMeta} numberOfLines={1}>
              {top ? `Submitted by ${top.from || 'Campus Office'} • ${relTime(top.created_at)}` : 'All directives acknowledged'}
            </Text>
          </View>
          <View style={styles.chevronBtn}>
            <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
          </View>
        </Pressable>
      </Panel>
      <View style={styles.actionRow}>
        <Pressable
          onPress={() => router.push('/notices')}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
        >
          <Ionicons name="add-circle-outline" size={17} color="#fff" />
          <Text style={styles.primaryBtnText}>Issue Executive Order</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/notices')}
          style={({ pressed }) => [styles.historyBtn, pressed && styles.pressed]}
        >
          <Ionicons name="create-outline" size={19} color={COLORS.primary} />
        </Pressable>
      </View>

      {/* Class performance */}
      <SectionHeader
        title="Class Performance"
        sub="Per-class entry status"
        action="Audit classes"
        onAction={() => router.push('/web/staff_dashboard')}
        style={styles.section}
      />
      <Panel style={styles.wings}>
        {wingRows.length === 0 ? (
          <Text style={styles.emptyWings}>No class activity yet today.</Text>
        ) : (
          wingRows.map((c, i, arr) => {
            const pct = c.students > 0 ? Math.round((c.entered / c.students) * 100) : 0;
            const full = pct === 100;
            const flagged = i === arr.length - 1 && !full;
            const label = full ? 'Exemplary' : pct >= 90 ? 'Optimal' : pct >= 80 ? 'Review' : 'Below Target';
            const tone = full ? 'mint' : pct >= 90 ? 'lavender' : pct >= 80 ? 'peach' : 'rose';
            return (
              <Pressable
                key={`${c.className}-${i}`}
                onPress={() => router.push('/web/staff_dashboard')}
                style={({ pressed }) => [
                  styles.wingRow,
                  i < arr.length - 1 && styles.wingRowBorder,
                  pressed && styles.pressed,
                ]}
              >
                <IconTile
                  icon={flagged ? 'warning-outline' : 'school-outline'}
                  tone={flagged ? 'rose' : 'sky'}
                  size={40}
                  radius={13}
                  iconSize={19}
                />
                <View style={styles.flex}>
                  <Text style={styles.wingName} numberOfLines={1}>
                    {c.className}
                  </Text>
                  <Text
                    style={[styles.wingMeta, flagged && { color: COLORS.danger }]}
                    numberOfLines={1}
                  >
                    {flagged
                      ? 'Below target — review entry'
                      : `${c.teacher || 'Class teacher'} • ${c.entered}/${c.students} Present`}
                  </Text>
                </View>
                <View style={styles.wingRight}>
                  <Text style={[styles.wingPct, flagged && { color: COLORS.danger }]}>{pct}%</Text>
                  <Pill label={label} tone={flagged ? 'rose' : tone} />
                </View>
              </Pressable>
            );
          })
        )}
      </Panel>

      {/* Executive Oversight */}
      <SectionHeader title="Executive Oversight" style={styles.section} />
      <View style={styles.gridRow}>
        <QuickTile
          icon="person-remove"
          title="Defaulters Roster"
          subtitle="Repeated absence list"
          tone="rose"
          columns={2}
          onPress={() => router.push('/defaulters')}
        />
        <QuickTile
          icon="ribbon-outline"
          title="Staff Punctuality"
          subtitle="Faculty biometric sign-in"
          tone="lavender"
          columns={2}
          onPress={() => router.push('/web/audit')}
        />
      </View>
      <View style={styles.gridRow}>
        <QuickTile
          icon="stats-chart-outline"
          title="Campus Digest"
          subtitle="Daily executive summary"
          tone="sky"
          columns={2}
          onPress={() => router.push('/web/reports')}
        />
        <QuickTile
          icon="finger-print-outline"
          title="Audit Trail Logs"
          subtitle="Tamper-proof ledger"
          tone="peach"
          dot
          columns={2}
          onPress={() => router.push('/web/audit')}
        />
      </View>

      {/* Institutional quotation */}
      <View style={styles.quote}>
        <Ionicons name="chatbox-ellipses-outline" size={18} color={COLORS.primary} />
        <Text style={styles.quoteText}>
          “Discipline and regularity form the bedrock of character building at SPS Sialkot. Ensure zero
          tolerance for undocumented absence.”
        </Text>
        <Text style={styles.quoteFrom}>— {user?.name || 'Principal'}</Text>
      </View>

      {/* Footer watermark */}
      <Pressable onPress={onSync} style={({ pressed }) => [styles.footer, pressed && styles.pressed]}>
        <Ionicons name="shield-checkmark" size={14} color={COLORS.textFaint} />
        <Text style={styles.footerText}>SPS Institutional Attendance Network • Sialkot</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: SPACING.md },
  flex: { flex: 1 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },

  hero: {
    backgroundColor: COLORS.primary,
    borderRadius: 20,
    padding: 16,
    gap: 8,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: {
    position: 'absolute',
    right: 1,
    bottom: 1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.success,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 10, fontFamily: FONT.regular, fontWeight: '400', color: '#fff', letterSpacing: 0.6 },
  ayPill: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  ayText: { fontSize: 10.5, fontFamily: FONT.regular, fontWeight: '400', color: '#fff' },
  heroName: {
    fontSize: 19,
    fontFamily: FONT.display,
    fontWeight: '300',
    color: '#fff',
    marginTop: 4,
  },
  heroRole: { fontSize: 12.5, color: 'rgba(255,255,255,0.85)', fontFamily: FONT.regular },

  cutoff: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 14,
    gap: 12,
  },
  cutoffTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cutoffTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.danger },
  cutoffTitle: { fontSize: 13.5, fontFamily: FONT.regular, fontWeight: '400', color: COLORS.text },
  cutoffSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 2, fontFamily: FONT.regular },
  verifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: COLORS.primarySoft,
    borderRadius: 12,
    paddingVertical: 9,
  },
  verifyText: { fontSize: 12, fontFamily: FONT.regular, fontWeight: '400', color: COLORS.primary },

  section: { marginTop: 6 },
  gridRow: { flexDirection: 'row', gap: SPACING.md },
  metric: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 14,
    gap: 4,
  },
  metricTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metricLabel: { fontSize: 12.5, color: COLORS.textMuted, fontFamily: FONT.regular },
  metricValue: { fontSize: 24, fontFamily: FONT.display, fontWeight: '300', color: COLORS.primary },
  metricValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  metricOf: { fontSize: 14, fontFamily: FONT.regular, fontWeight: '400', color: COLORS.textFaint },
  metricSub: { fontSize: 11, color: COLORS.textMuted, fontFamily: FONT.regular },
  metricTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.field,
    marginTop: 6,
    overflow: 'hidden',
  },
  metricFill: { height: '100%', borderRadius: 3, backgroundColor: COLORS.primary },

  directiveHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  directiveTitle: { fontSize: 15, fontFamily: FONT.display, fontWeight: '300', color: COLORS.text },
  directiveSub: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 2, fontFamily: FONT.regular },
  directiveCard: { paddingVertical: 2 },
  directiveInner: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  directiveLabel: {
    fontSize: 10,
    fontFamily: FONT.regular,
    fontWeight: '400',
    color: COLORS.danger,
    letterSpacing: 1,
  },
  directiveName: { fontSize: 13.5, fontFamily: FONT.regular, fontWeight: '400', color: COLORS.text, marginTop: 3 },
  directiveMeta: { fontSize: 11, color: COLORS.textMuted, marginTop: 3, fontFamily: FONT.regular },
  chevronBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: { flexDirection: 'row', gap: 10 },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 13,
  },
  primaryBtnText: { fontSize: 13.5, fontFamily: FONT.regular, fontWeight: '400', color: '#fff' },
  historyBtn: {
    width: 50,
    borderRadius: 14,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  wings: { paddingVertical: 4 },
  emptyWings: { fontSize: 13, color: COLORS.textMuted, fontFamily: FONT.regular, paddingVertical: 10 },
  wingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  wingRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.outline },
  wingName: { fontSize: 13.5, fontFamily: FONT.regular, fontWeight: '400', color: COLORS.text },
  wingMeta: { fontSize: 11, color: COLORS.textMuted, marginTop: 2, fontFamily: FONT.regular },
  wingRight: { alignItems: 'flex-end', gap: 3 },
  wingPct: { fontSize: 15, fontFamily: FONT.display, fontWeight: '300', color: COLORS.text },

  quote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 18,
    padding: 14,
  },
  quoteText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textMuted,
    fontFamily: FONT.regular,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  quoteFrom: { fontSize: 11, fontFamily: FONT.regular, fontWeight: '400', color: COLORS.textFaint, marginTop: 6 },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 4,
  },
  footerText: { fontSize: 10.5, color: COLORS.textFaint, fontFamily: FONT.regular },
});
