import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, FONT, RADIUS, SPACING } from '@/constants/theme';
import { IconTile, Panel, Pill, QuickTile, SectionHeader } from '@/components/UI';
import { useSession } from '@/store/session';
import { fetchNotices, markNoticesRead, Notice } from '@/services/api';
import type { AdminStats, ClassStatus } from '@/types';

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

/** Section-head wing desk: wing status, notices inbox, inspections and rosters. */
export default function SectionHeadHome({
  stats,
  classes,
  onSync,
}: {
  stats?: AdminStats;
  classes?: ClassStatus[];
  onSync: () => void;
}) {
  const router = useRouter();
  const { user } = useSession();
  const roster = classes ?? [];
  const activeSections = roster.length || stats?.classes || 0;
  const totalStudents = stats?.students || roster.reduce((sum, c) => sum + c.entered, 0);
  const presentTotal = roster.reduce((sum, c) => sum + c.entered, 0);
  const presentPct = totalStudents > 0 ? Math.round((presentTotal / totalStudents) * 100) : 0;
  const absentTotal = Math.max(totalStudents - presentTotal, 0);
  const teacherCount = stats?.teachers ?? roster.length;

  const [notices, setNotices] = useState<Notice[]>([]);
  const unread = notices.filter((n) => !n.read).length;

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

  const markRead = (id: number) => {
    void markNoticesRead([id]).then(() =>
      setNotices((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    );
  };

  return (
    <View style={styles.root}>
      {/* Greeting */}
      <View style={styles.greetRow}>
        <View style={styles.flex}>
          <View style={styles.greetLine}>
            <Text style={styles.greet} numberOfLines={1}>
              Assalam-o-Alaikum, {user?.name || 'Section Head'}
            </Text>
            <Ionicons name="shield-checkmark" size={16} color={COLORS.primary} />
          </View>
          <Text style={styles.greetSub} numberOfLines={1}>
            Head of Wing • Supervision desk
          </Text>
        </View>
        <View style={styles.avatar}>
          <Ionicons name="person" size={20} color={COLORS.primary} />
          <View style={styles.statusDot} />
        </View>
      </View>

      {/* Real-time wing status */}
      <Panel style={styles.wingCard}>
        <View style={styles.wingTop}>
          <View style={styles.wingDot} />
          <Text style={styles.wingTitle} numberOfLines={1}>
            Your Wing — Live Status
          </Text>
          <View style={styles.flex} />
          <Pill label={`${activeSections} Active Sections`} tone="lavender" />
        </View>
        <View style={styles.blockRow}>
          <IconTile icon="business-outline" tone="sky" size={32} radius={10} iconSize={16} />
          <View style={styles.flex}>
            <Text style={styles.blockTitle} numberOfLines={1}>
              {activeSections} sections under wing
            </Text>
            <Text style={styles.blockSub} numberOfLines={1}>
              Morning shift • {new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
            </Text>
          </View>
          <Ionicons name="pulse" size={17} color={COLORS.primary} />
        </View>
      </Panel>

      {/* Present rate + absence alerts */}
      <View style={styles.gridRow}>
        <Pressable
          onPress={() => router.push('/web/staff_dashboard')}
          style={({ pressed }) => [styles.metric, pressed && styles.pressed]}
        >
          <View style={styles.metricTop}>
            <Text style={styles.metricLabel}>Present Rate</Text>
            <IconTile icon="checkmark-done" tone="lavender" size={28} radius={9} iconSize={14} />
          </View>
          <View style={styles.metricValueRow}>
            <Text style={styles.metricValue}>{presentPct}%</Text>
            <Text style={styles.metricToday}>today</Text>
          </View>
          <Text style={styles.metricSub}>{presentTotal} of {totalStudents} Enrolled</Text>
          <View style={styles.metricTrack}>
            <View style={[styles.metricFill, { width: `${Math.min(presentPct, 100)}%` }]} />
          </View>
        </Pressable>

        <Pressable
          onPress={() => router.push('/defaulters')}
          style={({ pressed }) => [styles.metric, pressed && styles.pressed]}
        >
          <View style={styles.metricTop}>
            <Text style={styles.metricLabel}>Absence &amp; Alerts</Text>
            <IconTile icon="person-remove" tone="rose" size={28} radius={9} iconSize={14} />
          </View>
          <View style={styles.metricValueRow}>
            <Text style={[styles.metricValue, { color: COLORS.danger }]}>{absentTotal}</Text>
            <Text style={styles.metricToday}>Absentees</Text>
          </View>
          <Text style={styles.metricSub}>Review in defaulter list</Text>
          <View style={styles.metricTrack}>
            <View
              style={[
                styles.metricFill,
                { width: `${Math.max(100 - presentPct, 0)}%`, backgroundColor: COLORS.danger },
              ]}
            />
          </View>
        </Pressable>
      </View>

      {/* Section notices inbox */}
      <Panel style={styles.inbox}>
        <View style={styles.inboxHead}>
          <IconTile icon="mail-unread" tone="lavender" size={38} radius={12} iconSize={18} />
          <View style={styles.flex}>
            <Text style={styles.inboxTitle}>Section Notices Inbox</Text>
            <Text style={styles.inboxSub}>Supervisory &amp; campus directives</Text>
          </View>
          {unread > 0 ? <Pill label={`${unread} New`} tone="rose" solid /> : null}
          <Pressable
            onPress={() => router.push('/notices')}
            style={({ pressed }) => [styles.inboxBtn, pressed && styles.pressed]}
          >
            <Ionicons name="arrow-forward" size={14} color="#fff" />
          </Pressable>
        </View>

        {notices.length === 0 ? (
          <Text style={styles.inboxEmpty}>No notices yet — pull to refresh.</Text>
        ) : (
          notices.slice(0, 3).map((n, i) => (
            <View key={n.id} style={[styles.notice, i < Math.min(notices.length, 3) - 1 && styles.noticeBorder]}>
              <View style={styles.noticeTop}>
                {!n.read ? <View style={styles.noticeDot} /> : <View style={styles.noticeDotOff} />}
                <Text style={styles.noticeTitle} numberOfLines={1}>
                  {n.subject || '(no subject)'}
                </Text>
                <Text style={styles.noticeTime}>{relTime(n.created_at)}</Text>
              </View>
              <Text style={styles.noticeBody} numberOfLines={2}>
                {n.body}
              </Text>
              <View style={styles.noticeFoot}>
                <Text style={styles.noticeFrom} numberOfLines={1}>
                  {n.from || 'Campus Office'}
                </Text>
                <View style={styles.flex} />
                {!n.read ? (
                  <Pressable
                    onPress={() => markRead(n.id)}
                    style={({ pressed }) => [styles.noticeBtn, pressed && styles.pressed]}
                  >
                    <Ionicons name="checkmark-done" size={12} color={COLORS.primary} />
                    <Text style={styles.noticeBtnText}>Mark read</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => router.push('/notices')}
                  style={({ pressed }) => [styles.noticeBtn, styles.noticeBtnSolid, pressed && styles.pressed]}
                >
                  <Text style={styles.noticeBtnTextSolid}>View</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </Panel>

      {/* Web portal link */}
      <Pressable
        onPress={() => router.push('/web/staff_dashboard')}
        style={({ pressed }) => [styles.directory, pressed && styles.pressed]}
      >
        <IconTile icon="phone-portrait-outline" tone="slate" size={40} radius={13} iconSize={19} />
        <View style={styles.flex}>
          <Text style={styles.dirTitle}>Full Teacher List &amp; Duty Rosters</Text>
          <Text style={styles.dirSub} numberOfLines={1}>
            Available on web: attendance.spscsialkot.com
          </Text>
        </View>
        <View style={styles.dirCta}>
          <Ionicons name="open-outline" size={16} color="#fff" />
        </View>
      </Pressable>

      {/* Wing operations */}
      <SectionHeader title="Wing Operations" style={styles.section} />
      <View style={styles.gridRow}>
        <QuickTile
          icon="clipboard-outline"
          title="Inspection Log"
          subtitle="Record round checks"
          tone="sky"
          columns={2}
          onPress={() => router.push('/web/staff_dashboard')}
        />
        <QuickTile
          icon="megaphone-outline"
          title="Broadcast Notice"
          subtitle={`To all ${teacherCount} teachers`}
          tone="lavender"
          columns={2}
          onPress={() => router.push('/notices')}
        />
      </View>
      <View style={styles.gridRow}>
        <QuickTile
          icon="flag-outline"
          title="Flagged Defaulters"
          subtitle="Repeated absence list"
          tone="rose"
          columns={2}
          onPress={() => router.push('/defaulters')}
        />
        <QuickTile
          icon="time-outline"
          title="Late Entries"
          subtitle="Review gate records"
          tone="peach"
          columns={2}
          onPress={() => router.push('/web/audit')}
        />
      </View>

      {/* Wing sections roster */}
      <SectionHeader
        title="Wing Sections Roster Overview"
        action="All classes"
        onAction={() => router.push('/web/staff_dashboard')}
        style={styles.section}
      />
      <Panel style={styles.roster}>
        {roster.length === 0 ? (
          <Text style={styles.emptyRoster}>No class activity yet today.</Text>
        ) : (
          roster.slice(0, 5).map((c, i, arr) => {
            const absent = Math.max(c.students - c.entered, 0);
            const full = absent === 0;
            return (
              <Pressable
                key={`${c.className}-${i}`}
                onPress={() => router.push('/web/staff_dashboard')}
                style={({ pressed }) => [
                  styles.classRow,
                  i < arr.length - 1 && styles.classRowBorder,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.classAvatar}>
                  <Text style={styles.classAvatarText}>{c.className.split('-')[0] || c.className}</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.className} numberOfLines={1}>
                    {c.className}
                  </Text>
                  <Text style={styles.classMeta} numberOfLines={1}>
                    {c.teacher} • {c.entered}/{c.students} Present
                  </Text>
                </View>
                <Pill
                  label={full ? '100% Full' : `${absent} Absent`}
                  tone={full ? 'mint' : 'slate'}
                />
              </Pressable>
            );
          })
        )}
      </Panel>

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

  greetRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  greetLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  greet: { fontSize: 19, fontFamily: FONT.bold, fontWeight: '700', color: COLORS.text, flexShrink: 1 },
  greetSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2, fontFamily: FONT.regular },
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
    borderColor: COLORS.surface,
  },

  wingCard: { gap: 10 },
  wingTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  wingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  wingTitle: {
    fontSize: 15,
    fontFamily: FONT.bold,
    fontWeight: '700',
    color: COLORS.text,
    flexShrink: 1,
  },
  blockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.field,
    borderRadius: 12,
    padding: 10,
  },
  blockTitle: { fontSize: 12.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  blockSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 1, fontFamily: FONT.regular },

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
  metricValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  metricValue: { fontSize: 24, fontFamily: FONT.bold, fontWeight: '700', color: COLORS.primary },
  metricToday: { fontSize: 10.5, color: COLORS.textFaint, fontFamily: FONT.regular },
  metricSub: { fontSize: 11, color: COLORS.textMuted, fontFamily: FONT.regular },
  metricTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.field,
    marginTop: 6,
    overflow: 'hidden',
  },
  metricFill: { height: '100%', borderRadius: 3, backgroundColor: COLORS.primary },

  inbox: { gap: 10 },
  inboxHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  inboxTitle: { fontSize: 15, fontFamily: FONT.bold, fontWeight: '700', color: COLORS.text },
  inboxSub: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 2, fontFamily: FONT.regular },
  inboxBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inboxEmpty: { fontSize: 12, color: COLORS.textMuted, fontFamily: FONT.regular },

  notice: { gap: 5, paddingTop: 10 },
  noticeBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.outline, paddingBottom: 10 },
  noticeTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noticeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.danger },
  noticeDotOff: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.outline },
  noticeTitle: { flex: 1, fontSize: 13.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  noticeTime: { fontSize: 11, color: COLORS.textFaint, fontFamily: FONT.regular },
  noticeBody: { fontSize: 12, color: COLORS.textMuted, lineHeight: 17, fontFamily: FONT.regular },
  noticeFoot: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  noticeFrom: { fontSize: 11, color: COLORS.textFaint, fontFamily: FONT.regular, flexShrink: 1 },
  noticeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 26,
    paddingHorizontal: 9,
    borderRadius: 9,
    backgroundColor: COLORS.primarySoft,
  },
  noticeBtnSolid: { backgroundColor: COLORS.primary },
  noticeBtnText: { fontSize: 10.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.primary },
  noticeBtnTextSolid: { fontSize: 10.5, fontFamily: FONT.medium, fontWeight: '600', color: '#fff' },

  directory: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 18,
    padding: 12,
  },
  dirTitle: { fontSize: 13.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  dirSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 2, fontFamily: FONT.regular },
  dirCta: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  section: { marginTop: 6 },
  roster: { paddingVertical: 4 },
  emptyRoster: { fontSize: 13, color: COLORS.textMuted, fontFamily: FONT.regular, paddingVertical: 10 },

  classRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  classRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.outline },
  classAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  classAvatarText: { fontSize: 14, fontFamily: FONT.bold, fontWeight: '700', color: COLORS.primary },
  className: { fontSize: 13.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  classMeta: { fontSize: 11, color: COLORS.textMuted, marginTop: 1, fontFamily: FONT.regular },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 4,
  },
  footerText: { fontSize: 10.5, color: COLORS.textFaint, fontFamily: FONT.regular },
});
