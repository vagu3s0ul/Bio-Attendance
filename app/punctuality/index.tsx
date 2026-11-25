/**
 * Staff Punctuality — the principal's view of who signed in before the
 * morning cutoff. The server takes each teacher's first attendance entry of
 * the day as their sign-in, compares it with the entry deadline
 * (settings.entry_deadline) and returns today's verdict plus an on-time rate
 * over the recent window.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import Screen from '@/components/Screen';
import AppBar from '@/components/AppBar';
import Card from '@/components/Card';
import { COLORS, FONT, LABEL_CAPS, RADIUS, SPACING } from '@/constants/theme';
import { fetchPunctuality, type PunctualityData, type PunctualityRow } from '@/services/api';
import { SessionExpiredError } from '@/types';

type Filter = 'all' | 'late' | 'pending' | 'ontime';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All staff' },
  { key: 'late', label: 'Late' },
  { key: 'pending', label: 'Not signed in' },
  { key: 'ontime', label: 'On time' },
];

function initials(name: string): string {
  const parts = (name || '').replace(/^(mr|mrs|ms|miss|sir|dr)\.?\s+/i, '').trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

function rateTone(rate: number): { bg: string; fg: string } {
  if (rate >= 90) return { bg: COLORS.successSoft, fg: COLORS.success };
  if (rate >= 70) return { bg: COLORS.warningBg, fg: COLORS.warningText };
  return { bg: COLORS.dangerSoft, fg: COLORS.danger };
}

export default function StaffPunctualityScreen() {
  const router = useRouter();
  const [data, setData] = useState<PunctualityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await fetchPunctuality(14));
    } catch (e: any) {
      if (e instanceof SessionExpiredError) {
        router.replace('/login' as any);
        return;
      }
      setError(e?.message || 'Could not load staff punctuality.');
    }
  }, [router]);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const rows: PunctualityRow[] = data?.rows ?? [];
  const shown = rows.filter((r) => {
    if (filter === 'late') return r.hasEntry && r.late;
    if (filter === 'pending') return !r.hasEntry;
    if (filter === 'ontime') return r.hasEntry && !r.late;
    return true;
  });

  const stats = data?.stats;

  return (
    <Screen>
      <AppBar showBell={false} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={COLORS.primary} />
        }
      >
        <View style={styles.head}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back-outline" size={18} color={COLORS.primary} />
          </Pressable>
          <View style={styles.flex}>
            <Text style={styles.title}>Staff Punctuality</Text>
            <Text style={styles.sub}>
              First entry vs cutoff{data?.deadline ? ` • ${data.deadline}` : ''}
            </Text>
          </View>
          <View style={styles.windowPill}>
            <Text style={styles.windowText}>Last {data?.days ?? 14} days</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : error ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyText}>{error}</Text>
            <Pressable style={styles.retry} onPress={() => void onRefresh()}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </Card>
        ) : (
          <>
            <View style={styles.statRow}>
              <View style={[styles.stat, { backgroundColor: COLORS.successSoft }]}>
                <Text style={[styles.statValue, { color: COLORS.success }]}>
                  {stats?.onTimeToday ?? 0}
                </Text>
                <Text style={styles.statLabel}>On time today</Text>
              </View>
              <View style={[styles.stat, { backgroundColor: COLORS.dangerSoft }]}>
                <Text style={[styles.statValue, { color: COLORS.danger }]}>{stats?.lateToday ?? 0}</Text>
                <Text style={styles.statLabel}>Late today</Text>
              </View>
              <View style={[styles.stat, { backgroundColor: COLORS.surfaceLow }]}>
                <Text style={[styles.statValue, { color: COLORS.textMuted }]}>
                  {stats?.pendingToday ?? 0}
                </Text>
                <Text style={styles.statLabel}>Not signed in</Text>
              </View>
            </View>

            <View style={styles.rateCard}>
              <View style={styles.rateHead}>
                <View style={styles.flex}>
                  <Text style={styles.rateLabel}>CAMPUS ON-TIME RATE</Text>
                  <Text style={styles.rateSub}>
                    Average of {stats?.total ?? 0} teachers over the window
                  </Text>
                </View>
                <Text style={styles.rateValue}>{stats?.avgRate ?? 0}%</Text>
              </View>
              <View style={styles.track}>
                <View
                  style={[styles.fill, { width: `${Math.min(Math.max(stats?.avgRate ?? 0, 0), 100)}%` }]}
                />
              </View>
            </View>

            <View style={styles.filters}>
              {FILTERS.map((f) => {
                const active = filter === f.key;
                const count =
                  f.key === 'all'
                    ? rows.length
                    : f.key === 'late'
                      ? stats?.lateToday ?? 0
                      : f.key === 'pending'
                        ? stats?.pendingToday ?? 0
                        : stats?.onTimeToday ?? 0;
                return (
                  <Pressable
                    key={f.key}
                    onPress={() => setFilter(f.key)}
                    style={({ pressed }) => [
                      styles.filter,
                      active && styles.filterActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.filterText, active && styles.filterTextActive]}>
                      {f.label} {count}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {shown.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.success} />
                <Text style={styles.emptyText}>Nobody in this list.</Text>
              </Card>
            ) : (
              <View style={styles.list}>
                {shown.map((r, i) => {
                  const tone = rateTone(r.rate);
                  const pill = !r.hasEntry
                    ? { label: 'Pending', bg: COLORS.field, fg: COLORS.textMuted }
                    : r.late
                      ? { label: 'Late', bg: COLORS.dangerSoft, fg: COLORS.danger }
                      : { label: 'On time', bg: COLORS.successSoft, fg: COLORS.success };
                  return (
                    <View
                      key={r.username}
                      style={[styles.row, i < shown.length - 1 && styles.rowBorder]}
                    >
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{initials(r.name)}</Text>
                      </View>
                      <View style={styles.flex}>
                        <Text style={styles.name} numberOfLines={1}>
                          {r.name || r.username}
                        </Text>
                        <Text style={styles.meta} numberOfLines={1}>
                          {[r.className, r.wing].filter(Boolean).join(' • ') || 'No class'}
                        </Text>
                        <Text style={styles.rateLine} numberOfLines={1}>
                          {r.days > 0
                            ? `${r.onTime}/${r.days} days on time • ${r.rate}%`
                            : 'No entries in the window'}
                        </Text>
                      </View>
                      <View style={styles.right}>
                        <Text style={[styles.time, !r.hasEntry && styles.timeMuted]}>
                          {r.entryAt ?? '—'}
                        </Text>
                        <View style={[styles.pill, { backgroundColor: pill.bg }]}>
                          <Text style={[styles.pillText, { color: pill.fg }]}>{pill.label}</Text>
                        </View>
                        {r.days > 0 ? (
                          <View style={[styles.rateTag, { backgroundColor: tone.bg }]}>
                            <Text style={[styles.rateTagText, { color: tone.fg }]}>{r.rate}%</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            <Text style={styles.foot}>
              A teacher’s sign-in is their first attendance entry of the day. “Pending” means no
              entry has been made yet today.
            </Text>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: SPACING.xxl, gap: SPACING.md },
  pressed: { opacity: 0.9 },
  center: { paddingVertical: SPACING.xxl, alignItems: 'center' },

  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 19, fontFamily: FONT.display, fontWeight: '300', color: COLORS.text },
  sub: { fontSize: 11.5, color: COLORS.textMuted, fontFamily: FONT.regular, marginTop: 2 },
  windowPill: {
    backgroundColor: COLORS.lavender,
    borderRadius: RADIUS.full,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  windowText: { fontSize: 10, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.primary },

  statRow: { flexDirection: 'row', gap: SPACING.sm },
  stat: { flex: 1, borderRadius: RADIUS.lg, padding: SPACING.md, gap: 2 },
  statValue: { fontSize: 21, fontFamily: FONT.display, fontWeight: '300' },
  statLabel: { fontSize: 10.5, color: COLORS.text, fontFamily: FONT.regular },

  rateCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, gap: 8 },
  rateHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rateLabel: { ...LABEL_CAPS, fontSize: 10 },
  rateSub: { fontSize: 11, color: COLORS.textMuted, fontFamily: FONT.regular, marginTop: 2 },
  rateValue: { fontSize: 22, fontFamily: FONT.display, fontWeight: '300', color: COLORS.primary },
  track: { height: 6, borderRadius: 3, backgroundColor: COLORS.field, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3, backgroundColor: COLORS.primary },

  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filter: {
    backgroundColor: COLORS.chipIdle,
    borderRadius: RADIUS.full,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  filterActive: { backgroundColor: COLORS.primary },
  filterText: { fontSize: 11.5, color: COLORS.chipText, fontFamily: FONT.medium, fontWeight: '600' },
  filterTextActive: { color: '#fff' },

  list: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.outline },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 13, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.primary },
  name: { fontSize: 13.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  meta: { fontSize: 11, color: COLORS.textMuted, fontFamily: FONT.regular, marginTop: 1 },
  rateLine: { fontSize: 10.5, color: COLORS.textFaint, fontFamily: FONT.regular, marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 3 },
  time: { fontSize: 12.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  timeMuted: { color: COLORS.textFaint },
  pill: { borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontSize: 9.5, fontFamily: FONT.medium, fontWeight: '600' },
  rateTag: { borderRadius: RADIUS.sm, paddingHorizontal: 6, paddingVertical: 1 },
  rateTagText: { fontSize: 9.5, fontFamily: FONT.medium, fontWeight: '600' },

  emptyCard: { alignItems: 'center', gap: 8, paddingVertical: SPACING.xl },
  emptyText: { fontSize: 12.5, color: COLORS.textMuted, fontFamily: FONT.regular, textAlign: 'center' },
  retry: {
    marginTop: 4,
    backgroundColor: COLORS.primarySoft,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 8,
  },
  retryText: { fontSize: 12, color: COLORS.primary, fontFamily: FONT.medium, fontWeight: '600' },

  foot: {
    fontSize: 10.5,
    color: COLORS.textFaint,
    fontFamily: FONT.regular,
    lineHeight: 15,
    paddingHorizontal: 2,
  },
});
