import React, { useCallback, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import Screen from '@/components/Screen';
import Card from '@/components/Card';
import AppBar from '@/components/AppBar';
import AdminHome from '@/components/home/AdminHome';
import TeacherHome from '@/components/home/TeacherHome';
import AccountantHome from '@/components/home/AccountantHome';
import PrincipalHome from '@/components/home/PrincipalHome';
import SectionHeadHome from '@/components/home/SectionHeadHome';
import { COLORS, FONT, RADIUS, SPACING } from '@/constants/theme';
import { fetchHome } from '@/services/api';
import { useSession } from '@/store/session';
import { HomeData, SessionExpiredError } from '@/types';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const router = useRouter();
  const { user, signOut } = useSession();
  const [data, setData] = useState<HomeData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (asRefresh = false) => {
      if (asRefresh) setRefreshing(true);
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
  const roleLabel =
    role === 'admin'
      ? 'Administrator'
      : role === 'accountant'
      ? 'Accountant'
      : role === 'principal'
      ? 'Principal'
      : role === 'section_head'
      ? 'Section Head'
      : 'Teacher';
  const isAdmin = role === 'admin';

  // Admin control room (new UI)
  if (isAdmin && data?.role === 'admin') {
    return (
      <Screen>
        <AppBar />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={COLORS.primary}
            />
          }
        >
          <AdminHome stats={data.stats} classes={data.classes} onReload={() => load(true)} />
        </ScrollView>
      </Screen>
    );
  }

  // Teacher desk (new UI)
  if (data?.role === 'teacher') {
    return (
      <Screen>
        <AppBar />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={COLORS.primary}
            />
          }
        >
          <TeacherHome stats={data.stats} onSync={() => load(true)} />
        </ScrollView>
      </Screen>
    );
  }

  // Accounts desk (new UI)
  if (data?.role === 'accountant') {
    return (
      <Screen>
        <AppBar />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={COLORS.primary}
            />
          }
        >
          <AccountantHome
            students={data.stats.students}
            deadline={data.stats.deadline}
            classes={data.classes || []}
            onSync={() => load(true)}
          />
        </ScrollView>
      </Screen>
    );
  }

  // Principal / Section Head (new UI)
  if (role === 'principal' || role === 'section_head') {
    return (
      <Screen>
        <AppBar />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={COLORS.primary}
            />
          }
        >
          {role === 'principal' ? (
            <PrincipalHome
              stats={data && data.role === 'principal' ? data.stats : undefined}
              classes={data && data.role === 'principal' ? data.classes : undefined}
              onSync={() => load(true)}
            />
          ) : (
            <SectionHeadHome
              stats={data && data.role === 'section_head' ? data.stats : undefined}
              classes={data && data.role === 'section_head' ? data.classes : undefined}
              onSync={() => load(true)}
            />
          )}
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <AppBar />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Card style={styles.statusCard}>
          <Text style={styles.statusTitle}>
            {greeting()}, {user.username} · {roleLabel}
          </Text>
          <Text style={styles.statusBody}>Loading your desk…</Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: SPACING.lg, paddingBottom: 40, gap: SPACING.lg },
  greeting: { gap: 2 },
  greetingTitle: {
    fontSize: 24,
    fontFamily: FONT.medium,
    fontWeight: '600',
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
    height: 48,
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.surfaceLow,
    fontFamily: FONT.regular,
    marginTop: 6,
  },
  modalErr: { fontSize: 12, color: COLORS.danger, fontFamily: FONT.regular },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  modalCancel: {
    flex: 1,
    height: 48,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: { color: COLORS.text, fontSize: 14, fontFamily: FONT.medium, fontWeight: '600' },
  modalSave: {
    flex: 1,
    height: 48,
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
    height: 48,
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
  statusDone: { backgroundColor: COLORS.successSoft },
  statusNotDone: { backgroundColor: COLORS.dangerSoft },
  statusLate: { backgroundColor: COLORS.warningBg },
  statusText: { fontSize: 11, fontWeight: '600', fontFamily: FONT.medium },
  statusTextDone: { color: COLORS.compliant },
  statusTextNotDone: { color: COLORS.danger },
  statusTextLate: { color: COLORS.warningText },
  pressedBtn: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
