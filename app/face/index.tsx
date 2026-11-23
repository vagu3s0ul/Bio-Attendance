import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import Screen from '@/components/Screen';
import AppBar from '@/components/AppBar';
import { IconTile, ListRow, Panel, Pill, StatTile } from '@/components/UI';
import { COLORS, FONT, RADIUS, SPACING } from '@/constants/theme';
import { FaceRoster, fetchFaceRoster, fetchReportClasses } from '@/services/api';
import { useSession } from '@/store/session';
import { SessionExpiredError } from '@/types';

type Mode = 'scan' | 'enroll';

export default function FaceHomeScreen() {
  const router = useRouter();
  const { user, signOut } = useSession();
  const isAdmin = user?.role === 'admin';

  const [classes, setClasses] = useState<string[]>([]);
  const [className, setClassName] = useState<string | undefined>(undefined);
  const [roster, setRoster] = useState<FaceRoster | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mode, setMode] = useState<Mode>('scan');
  const [queueOnly, setQueueOnly] = useState(false);

  const handleExpired = useCallback(async () => {
    Alert.alert('Session expired', 'Please log in again.');
    await signOut();
    router.replace('/(auth)/login');
  }, [router, signOut]);

  const load = useCallback(
    async (asRefresh = false) => {
      if (asRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        let activeClass = className;

        if (isAdmin) {
          const available = await fetchReportClasses();
          setClasses(available);
          if (!activeClass && available.length > 0) {
            activeClass = available[0];
            setClassName(activeClass);
          }
        }

        setRoster(await fetchFaceRoster({ className: isAdmin ? activeClass : undefined }));
      } catch (e: any) {
        if (e instanceof SessionExpiredError) {
          await handleExpired();
          return;
        }
        Alert.alert("Couldn't load faces", e?.message || 'Check your connection.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [className, handleExpired, isAdmin]
  );

  useFocusEffect(
    useCallback(() => {
      load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAdmin, className])
  );

  const canScan = !isAdmin && (roster?.enrolled ?? 0) > 0;
  const total = roster?.total ?? 0;
  const enrolled = roster?.enrolled ?? 0;
  const missing = Math.max(0, total - enrolled);
  const present = roster?.present ?? 0;
  const pct = total > 0 ? Math.round((present / total) * 100) : 0;

  const verified = useMemo(
    () => (roster?.students ?? []).filter((s) => s.present).slice(0, 4),
    [roster]
  );
  const queue = useMemo(
    () => (roster?.students ?? []).filter((s) => s.samples === 0),
    [roster]
  );

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
        {/* Segmented control */}
        <View style={styles.segment}>
          <Pressable
            onPress={() => setMode('scan')}
            style={[styles.segmentBtn, mode === 'scan' && styles.segmentBtnOn]}
          >
            <Ionicons
              name="scan-outline"
              size={17}
              color={mode === 'scan' ? '#fff' : COLORS.textMuted}
            />
            <Text style={[styles.segmentText, mode === 'scan' && styles.segmentTextOn]}>
              Scan Attendance
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setMode('enroll');
              setQueueOnly(true);
              if (roster && queue.length > 0) {
                const payload = JSON.stringify(
                  queue.map((s) => ({ roll: s.roll, name: s.name }))
                );
                router.push({
                  pathname: '/face/enroll',
                  params: {
                    roll: queue[0].roll,
                    name: queue[0].name,
                    className: roster.class,
                    samples: String(queue[0].samples),
                    queue: payload,
                    qi: '0',
                  },
                });
              }
            }}
            style={[styles.segmentBtn, mode === 'enroll' && styles.segmentBtnOn]}
          >
            <Ionicons
              name="person-add-outline"
              size={17}
              color={mode === 'enroll' ? '#fff' : COLORS.textMuted}
            />
            <Text style={[styles.segmentText, mode === 'enroll' && styles.segmentTextOn]}>
              Enroll Student Face
            </Text>
          </Pressable>
        </View>

        {isAdmin && classes.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.classScroll}
            contentContainerStyle={styles.classList}
          >
            {classes.map((c) => {
              const active = c === className;
              return (
                <Pressable
                  key={c}
                  onPress={() => setClassName(c)}
                  style={[styles.classChip, active && styles.classChipActive]}
                >
                  <Text style={[styles.classChipText, active && styles.classChipTextOn]}>{c}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {loading && !roster ? (
          <View style={styles.loading}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading roster…</Text>
          </View>
        ) : roster ? (
          <>
            {/* Scanner entry card */}
            <Panel style={styles.scanCard}>
              <View style={styles.scanTop}>
                <Pill label="AI BIOMETRIC ACTIVE" tone="sky" icon="ellipse" />
                <View style={styles.scanTopIcons}>
                  <IconTile icon="flash-outline" size={32} radius={11} tone="slate" iconSize={16} />
                  <IconTile icon="camera-reverse-outline" size={32} radius={11} tone="slate" iconSize={16} />
                </View>
              </View>

              <View style={styles.frame}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
                <Ionicons name="scan-circle-outline" size={68} color="rgba(30,77,183,0.35)" />
                <Text style={styles.frameHint}>Keep student within reticle frame</Text>
              </View>

              <Pressable
                onPress={() => router.push('/face/scan')}
                disabled={!canScan}
                style={({ pressed }) => [
                  styles.scanBtn,
                  !canScan && styles.scanBtnOff,
                  pressed && canScan && styles.pressed,
                ]}
              >
                <IconTile icon="scan" tone="lavender" size={34} radius={11} iconSize={17} />
                <View style={styles.flex}>
                  <Text style={styles.scanBtnTitle}>Start face check</Text>
                  <Text style={styles.scanBtnSub} numberOfLines={1}>
                    {isAdmin
                      ? 'Class teachers run the live scan'
                      : enrolled === 0
                      ? 'Enroll at least one student first'
                      : `Scan and mark ${total} students present`}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
              </Pressable>
            </Panel>

            {/* Bento stats */}
            <View style={styles.gridRow}>
              <StatTile
                label="Enrolled"
                value={`${enrolled}/${total}`}
                sub="Face templates"
                icon="people-outline"
                tone="lavender"
              />
              <StatTile
                label="Present Today"
                value={present}
                sub="Face verified"
                icon="checkmark-circle-outline"
                tone="sky"
                badge={`${pct}%`}
                badgeTone="sky"
              />
            </View>

            {/* Today's scans */}
            <Panel style={styles.scansPanel}>
              <View style={styles.scansHead}>
                <View style={styles.flex}>
                  <Text style={styles.scansLabel}>Today's Facial Scans</Text>
                  <Text style={styles.scansValue}>{present}</Text>
                  <Text style={styles.scansSub}>Students Marked</Text>
                </View>
                <IconTile icon="bar-chart-outline" tone="lavender" size={38} radius={12} iconSize={18} />
              </View>

              <Text style={styles.recentLabel}>RECENT VERIFICATIONS</Text>
              {verified.length === 0 ? (
                <Text style={styles.empty}>No face check-ins recorded yet today.</Text>
              ) : (
                verified.map((s, i) => (
                  <ListRow
                    key={s.roll}
                    icon="checkmark-circle-outline"
                    tone="mint"
                    title={s.name}
                    sub={`Roll #${s.roll} • ${roster.class}`}
                    right="Verified"
                    last={i === verified.length - 1}
                  />
                ))
              )}
            </Panel>

            {/* Actions */}
            <Pressable
              onPress={() => router.push('/(tabs)/entry')}
              style={({ pressed }) => [styles.ghostBtn, pressed && styles.pressed]}
            >
              <Ionicons name="list-outline" size={18} color={COLORS.text} />
              <Text style={styles.ghostBtnText}>Switch to Manual Entry</Text>
            </Pressable>

            <Pressable
              onPress={() => setQueueOnly((v) => !v)}
              style={({ pressed }) => [styles.queueBtn, pressed && styles.pressed]}
            >
              <Ionicons name="person-remove-outline" size={18} color={COLORS.danger} />
              <Text style={styles.queueBtnText}>View Unrecognized Queue</Text>
              <View style={styles.queueCount}>
                <Text style={styles.queueCountText}>{missing}</Text>
              </View>
            </Pressable>

            {/* Roster */}
            <View style={styles.rosterHead}>
              <Text style={styles.rosterTitle}>
                {queueOnly && mode === 'enroll' ? 'Missing Faces' : 'Students'}
              </Text>
              <Pill label={`${queueOnly && mode === 'enroll' ? missing : enrolled} shown`} tone="slate" />
              <View style={styles.flex} />
              <Text style={styles.rosterMeta}>
                {enrolled} enrolled · {missing} missing
              </Text>
            </View>

            <Panel style={styles.list}>
              {(queueOnly && mode === 'enroll' ? queue : roster.students).length === 0 ? (
                <Text style={styles.empty}>
                  {queueOnly && mode === 'enroll'
                    ? 'Every student in this class is enrolled.'
                    : 'No active students in this class.'}
                </Text>
              ) : (
                (queueOnly && mode === 'enroll' ? queue : roster.students).map((student, i, arr) => (
                  <ListRow
                    key={student.roll}
                    icon={student.samples > 0 ? 'checkmark-circle-outline' : 'person-add-outline'}
                    tone={student.samples > 0 ? 'mint' : 'peach'}
                    title={student.name}
                    sub={`Roll #${student.roll} • ${
                      student.samples > 0 ? `${student.samples} face samples` : 'Not enrolled yet'
                    }`}
                    right={student.present ? 'Present' : student.samples > 0 ? 'Enrolled' : 'Enroll'}
                    last={i === arr.length - 1}
                    onPress={() => {
                      const idx = queue.findIndex((s) => s.roll === student.roll);
                      const payload =
                        queue.length > 0
                          ? JSON.stringify(queue.map((s) => ({ roll: s.roll, name: s.name })))
                          : '';
                      router.push({
                        pathname: '/face/enroll',
                        params: {
                          roll: student.roll,
                          name: student.name,
                          className: roster.class,
                          samples: String(student.samples),
                          ...(idx >= 0 && payload
                            ? { queue: payload, qi: String(idx) }
                            : {}),
                        },
                      });
                    }}
                  />
                ))
              )}
            </Panel>

            <Text style={styles.footnote}>
              Threshold {roster.threshold.toFixed(2)} · matched on this device, saved to Daily Entry.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: SPACING.lg, paddingBottom: 32, gap: SPACING.md },

  segment: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: COLORS.chipIdle,
    borderRadius: 16,
    padding: 5,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 42,
    borderRadius: 12,
  },
  segmentBtnOn: { backgroundColor: COLORS.primary },
  segmentText: { fontSize: 13, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.textMuted },
  segmentTextOn: { color: '#fff' },

  classList: { gap: 8, paddingVertical: 2 },
  classScroll: { flexGrow: 0 },
  classChip: {
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
  },
  classChipActive: { backgroundColor: COLORS.primary },
  classChipText: { fontSize: 13, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.textMuted },
  classChipTextOn: { color: '#fff' },

  loading: { paddingVertical: 40, alignItems: 'center', gap: 10 },
  loadingText: { color: COLORS.textMuted, fontSize: 13, fontFamily: FONT.regular },

  scanCard: { gap: 12 },
  scanTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scanTopIcons: { flexDirection: 'row', gap: 8 },
  frame: {
    height: 210,
    borderRadius: 18,
    backgroundColor: COLORS.field,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  corner: { position: 'absolute', width: 26, height: 26, borderColor: COLORS.primary },
  cornerTL: { top: 24, left: 24, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
  cornerTR: { top: 24, right: 24, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
  cornerBL: { bottom: 24, left: 24, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 },
  cornerBR: { bottom: 24, right: 24, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 },
  frameHint: { fontSize: 12, color: COLORS.textMuted, fontFamily: FONT.regular },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.field,
    borderRadius: 14,
    padding: 10,
  },
  scanBtnOff: { opacity: 0.55 },
  scanBtnTitle: { fontSize: 13.5, fontFamily: FONT.regular, fontWeight: '400', color: COLORS.text },
  scanBtnSub: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 2, fontFamily: FONT.regular },

  gridRow: { flexDirection: 'row', gap: SPACING.md },

  scansPanel: { gap: 6 },
  scansHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scansLabel: { fontSize: 12.5, color: COLORS.textMuted, fontFamily: FONT.regular },
  scansValue: { fontSize: 26, fontFamily: FONT.display, fontWeight: '300', color: COLORS.primary },
  scansSub: { fontSize: 12, color: COLORS.textMuted, fontFamily: FONT.regular },
  recentLabel: {
    fontSize: 10.5,
    letterSpacing: 0.8,
    fontFamily: FONT.medium,
    fontWeight: '600',
    color: COLORS.textFaint,
    marginTop: 6,
  },
  empty: { fontSize: 12.5, color: COLORS.textMuted, fontFamily: FONT.regular, paddingVertical: 10 },

  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    height: 52,
    borderRadius: 15,
    backgroundColor: COLORS.chipIdle,
  },
  ghostBtnText: { fontSize: 13.5, fontFamily: FONT.regular, fontWeight: '400', color: COLORS.text },
  queueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    height: 52,
    borderRadius: 15,
    backgroundColor: COLORS.roseSoft,
  },
  queueBtnText: { fontSize: 13.5, fontFamily: FONT.regular, fontWeight: '400', color: COLORS.danger },
  queueCount: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 11,
    backgroundColor: COLORS.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueCountText: { fontSize: 11.5, fontFamily: FONT.regular, fontWeight: '400', color: '#fff' },

  rosterHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  rosterTitle: { fontSize: 17, fontFamily: FONT.regular, fontWeight: '400', color: COLORS.text },
  rosterMeta: { fontSize: 11.5, color: COLORS.textMuted, fontFamily: FONT.regular },
  list: { paddingVertical: 4 },
  footnote: {
    fontSize: 11,
    color: COLORS.textFaint,
    textAlign: 'center',
    fontFamily: FONT.regular,
    marginTop: 2,
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
