import React, { useCallback, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import Screen from '@/components/Screen';
import Card from '@/components/Card';
import StatCard from '@/components/StatCard';
import ActionCard from '@/components/ActionCard';
import { COLORS, FONT, LABEL_CAPS, RADIUS, SPACING } from '@/constants/theme';
import { fetchHome, updateDeadline } from '@/services/api';
import { useSession } from '@/store/session';
import { HomeData, SessionExpiredError } from '@/types';

/** "09:30 AM" → "09:30" (24h) for the deadline input. */
function to24h(time: string): string {
  const m = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return time.trim();
  let h = parseInt(m[1], 10);
  const mm = m[2];
  if (/pm/i.test(m[3] || '') && h < 12) h += 12;
  if (/am/i.test(m[3] || '') && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${mm}`;
}

function DeadlineBanner({ text }: { text: string }) {
  return (
    <View style={styles.deadline}>
      <Ionicons name="warning" size={18} color="#B28200" />
      <Text style={styles.deadlineText}>
        Entries close at <Text style={styles.deadlineStrong}>{text || '09:30 AM'}</Text> · 1st Period
      </Text>
    </View>
  );
}

/** Admin attendance-deadline card (design: label + value + Change). */
function DeadlineCard({
  value,
  onChanged,
}: {
  value: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const openModal = () => {
    setTime(to24h(value));
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
        onChanged();
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
    <>
      <View style={styles.deadlineCard}>
        <View style={styles.deadlineCardIcon}>
          <Ionicons name="time" size={20} color={COLORS.primary} />
        </View>
        <View style={styles.deadlineCardText}>
          <Text style={[styles.deadlineCardLabel, LABEL_CAPS]}>Attendance Deadline</Text>
          <Text style={styles.deadlineCardValue}>{value || '09:30 AM'}</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.changeBtn, pressed && styles.pressedBtn]}
          onPress={openModal}
        >
          <Text style={styles.changeBtnText}>Change</Text>
        </Pressable>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Attendance Deadline</Text>
            <Text style={styles.modalSub}>
              Entries saved after this time are marked LATE.
            </Text>
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
                style={({ pressed }) => [styles.modalSave, pressed && styles.pressedBtn, busy && styles.saveBtnBusy]}
                onPress={save}
                disabled={busy}
              >
                <Text style={styles.modalSaveText}>{busy ? 'Saving…' : 'Save'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function shortDate(): string {
  return new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function HomeScreen() {
  const router = useRouter();
  const { user, signOut } = useSession();
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (asRefresh = false) => {
      if (asRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        setData(await fetchHome());
      } catch (e: any) {
        if (e instanceof SessionExpiredError) {
          Alert.alert('Session expired', 'Please log in again.');
          await signOut();
          router.replace('/(auth)/login');
          return;
        }
        if (!asRefresh) {
          Alert.alert("Couldn't refresh", e?.message || 'Check your connection.');
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [signOut]
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!user) return <Redirect href="/(auth)/login" />;

  // Prefer the role the server just served (fetchHome self-corrects on
  // server-side role changes) over the session snapshot.
  const role = data ? data.role : user.role;
  const classes = data && 'classes' in data ? data.classes : [];
  const roleLabel = role === 'admin' ? 'Administrator' : 'Teacher';
  const isAdmin = role === 'admin';

  const teacherProgress =
    data?.role === 'teacher'
      ? data.stats.total > 0
        ? Math.round((data.stats.entered / data.stats.total) * 100)
        : 0
      : 0;
  const teacherDone = data?.role === 'teacher' && data.stats.total > 0 && data.stats.entered >= data.stats.total;

  return (
    <Screen edges={[]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={COLORS.primary} />
        }
      >
        <View style={styles.greeting}>
          <Text style={styles.greetingTitle} numberOfLines={1}>
            {greeting()}, {user.username} · {roleLabel}
          </Text>
          <Text style={styles.greetingSub}>Welcome back. Here is your overview for today.</Text>
        </View>

        {data ? <DeadlineBanner text={data.stats.deadline} /> : null}

        <View style={styles.statsGrid}>
          {data?.role === 'admin' ? (
            <>
              <StatCard label="Teachers" value={data.stats.teachers} />
              <StatCard label="Students" value={data.stats.students} />
              <StatCard label="Classes" value={data.stats.classes} />
              <StatCard label="Today's Entries" value={data.stats.todayEntries} accent />
            </>
          ) : data?.role === 'teacher' ? (
            <>
              <StatCard label="Total Students" value={data.stats.totalStudents} />
              <StatCard
                label="Today's Entries"
                value={`${data.stats.entered}/${data.stats.total}`}
                valueColor={data.stats.entered > 0 ? COLORS.text : COLORS.danger}
                accent
              />
              <StatCard label="Days This Month" value={data.stats.daysThisMonth} />
              <StatCard label="Date" value={shortDate()} />
            </>
          ) : (
            <>
              <StatCard label="Total Students" value={loading ? '—' : 0} />
              <StatCard label="Today's Entries" value={loading ? '—' : '0/0'} accent />
              <StatCard label="Days This Month" value={loading ? '—' : 0} />
              <StatCard label="Date" value={shortDate()} />
            </>
          )}
        </View>

        {/* Quick actions — role-scoped */}
        <Text style={[styles.sectionTitle, LABEL_CAPS]}>Quick Actions</Text>
        <View style={styles.actions}>
          <ActionCard
            icon="create-outline"
            title="Daily Entry"
            subtitle="Mark attendance and uniform"
            filled
            onPress={() => router.push('/(tabs)/entry')}
          />
          <ActionCard
            icon="analytics-outline"
            title="View Reports"
            subtitle="Daily, weekly, monthly & student-wise"
            onPress={() => router.push('/(tabs)/reports')}
          />
          {isAdmin ? (
            <>
              <ActionCard
                icon="eye-outline"
                title="Audit Trail"
                subtitle="Secret entry timestamps & late detection"
                onPress={() => router.push('/web/audit')}
              />
              <ActionCard
                icon="people-outline"
                title="Manage"
                subtitle="Teachers, students & CSV upload"
                onPress={() => router.push('/manage')}
              />
            </>
          ) : null}
          <ActionCard
            icon="download-outline"
            title="Export Data"
            subtitle="Download records as CSV"
            onPress={() => router.push('/web/export')}
          />
        </View>

        {/* Admin: attendance deadline */}
        {isAdmin && data ? (
          <DeadlineCard
            value={data.stats.deadline}
            onChanged={() => load(true)}
          />
        ) : null}

        {/* Status */}
        {!isAdmin ? (
          <Card style={styles.statusCard}>
            <View style={styles.statusIcon}>
              <Ionicons name="time-outline" size={22} color={COLORS.textMuted} />
            </View>
            <Text style={styles.statusTitle}>
              {teacherDone
                ? "Today's entry complete"
                : data?.role === 'teacher' && data.stats.entered > 0
                ? `Today's entry in progress`
                : "Today's entry not yet started"}
            </Text>
            <Text style={styles.statusBody}>
              {teacherDone
                ? 'Great work — all checks recorded for today.'
                : data?.role === 'teacher' && data.stats.entered > 0
                ? `${data.stats.entered} of ${data.stats.total} students marked (${teacherProgress}%).`
                : 'Complete your daily checks for your class.'}
            </Text>
            <Pressable
              style={({ pressed }) => [styles.statusBtn, pressed && styles.pressedBtn]}
              onPress={() => router.push('/(tabs)/entry')}
            >
              <Text style={styles.statusBtnText}>
                {teacherDone ? 'View Entry' : 'Start Now'}
              </Text>
            </Pressable>
          </Card>
        ) : null}

        {isAdmin && classes.length > 0 ? (
          <>
            <Text style={[styles.sectionTitle, LABEL_CAPS]}>Today's Entry Status</Text>
            <Card style={styles.classList}>
              {classes.map((c, i) => (
                <Pressable
                  key={`${c.className}-${i}`}
                  style={({ pressed }) => [styles.classRow, i > 0 && styles.classRowBorder, pressed && styles.pressed]}
                  onPress={() =>
                    router.push({ pathname: '/web/[page]', params: { page: 'reports' } })
                  }
                >
                  <View style={styles.classNameWrap}>
                    <Text style={styles.className}>{c.className}</Text>
                    <Text style={styles.classTeacher} numberOfLines={1}>
                      {c.teacher}
                    </Text>
                  </View>
                  <View style={styles.classCounts}>
                    <Text style={styles.classCount}>
                      {c.entered}/{c.students} entered
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusChip,
                      c.status === 'Done'
                        ? styles.statusDone
                        : c.status === 'Not Done'
                        ? styles.statusNotDone
                        : styles.statusLate,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        c.status === 'Done'
                          ? styles.statusTextDone
                          : c.status === 'Not Done'
                          ? styles.statusTextNotDone
                          : styles.statusTextLate,
                      ]}
                    >
                      {c.status}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </Card>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: SPACING.lg, paddingBottom: 40, gap: SPACING.lg },
  greeting: { gap: 2 },
  greetingTitle: {
    fontSize: 22,
    fontFamily: FONT.display,
    fontWeight: '300',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  greetingSub: { fontSize: 14, color: COLORS.textMuted, fontFamily: FONT.regular, marginTop: 2 },
  deadline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.warningBg,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  deadlineText: { flex: 1, color: COLORS.warningText, fontSize: 13, fontFamily: FONT.regular },
  deadlineStrong: { fontFamily: FONT.medium, fontWeight: '600' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md },
  sectionTitle: { color: COLORS.textMuted, marginTop: 2 },
  actions: { gap: SPACING.md },
  // Deadline card
  deadlineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 14,
    minHeight: 72,
  },
  deadlineCardIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deadlineCardText: { flex: 1 },
  deadlineCardLabel: { color: COLORS.textMuted, fontSize: 10.5 },
  deadlineCardValue: { fontSize: 18, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text, marginTop: 1 },
  changeBtn: {
    minHeight: 36,
    paddingHorizontal: 16,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeBtnText: { color: COLORS.primary, fontSize: 13, fontFamily: FONT.medium, fontWeight: '600' },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    alignSelf: 'stretch',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 20,
    gap: 8,
  },
  modalTitle: { fontSize: 18, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  modalSub: { fontSize: 13, color: COLORS.textMuted, fontFamily: FONT.regular, lineHeight: 18 },
  modalInput: {
    height: 44,
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.background,
    fontFamily: FONT.regular,
    marginTop: 6,
  },
  modalErr: { fontSize: 12, color: COLORS.danger, fontFamily: FONT.regular },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  modalCancel: {
    flex: 1,
    height: 44,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: { color: COLORS.text, fontSize: 14, fontFamily: FONT.medium, fontWeight: '600' },
  modalSave: {
    flex: 1,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnBusy: { opacity: 0.7 },
  modalSaveText: { color: '#fff', fontSize: 14, fontFamily: FONT.medium, fontWeight: '600' },
  statusCard: { alignItems: 'center', gap: 6, paddingVertical: 20 },
  statusIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.surfaceLow,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  statusTitle: {
    fontSize: 18,
    fontFamily: FONT.regular,
    fontWeight: '400',
    color: COLORS.text,
    textAlign: 'center',
  },
  statusBody: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    fontFamily: FONT.regular,
    lineHeight: 19,
  },
  statusBtn: {
    marginTop: 8,
    alignSelf: 'stretch',
    height: 44,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBtnText: { color: COLORS.onPrimary, fontSize: 14, fontFamily: FONT.medium, fontWeight: '600' },
  classList: { padding: 6 },
  classRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: RADIUS.sm },
  classRowBorder: { borderTopWidth: 1, borderTopColor: COLORS.outline },
  pressed: { backgroundColor: COLORS.surfaceLow },
  classNameWrap: { flex: 1 },
  className: { fontSize: 15, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  classTeacher: { fontSize: 12, color: COLORS.textMuted, marginTop: 1, fontFamily: FONT.regular },
  classCounts: { marginRight: 10 },
  classCount: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600', fontFamily: FONT.regular },
  statusChip: { borderRadius: RADIUS.sm, paddingHorizontal: 9, paddingVertical: 4 },
  statusDone: { backgroundColor: '#E9F7EF' },
  statusNotDone: { backgroundColor: COLORS.dangerSoft },
  statusLate: { backgroundColor: COLORS.warningBg },
  statusText: { fontSize: 11, fontWeight: '600', fontFamily: FONT.medium },
  statusTextDone: { color: COLORS.compliant },
  statusTextNotDone: { color: COLORS.danger },
  statusTextLate: { color: COLORS.warningText },
  pressedBtn: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
