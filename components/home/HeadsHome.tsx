/**
 * Heads' home shell (Principal + Section Head): the Overview is the role's
 * existing home; the other tabs are real lists fed by the same data.
 *
 * Tabs: Overview | Attendance | Classes | Notices. The tab bar sits inside
 * the home scroll content (bottom of the visible area) — the app's bottom
 * navigation is untouched. Metric cards on the Overview open the matching
 * tab via onOpenTab.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, FONT, SHADOW, SPACING } from '@/constants/theme';
import PrincipalHome from '@/components/home/PrincipalHome';
import SectionHeadHome from '@/components/home/SectionHeadHome';
import HeadsAttendanceList from '@/components/home/HeadsAttendanceList';
import HeadsClassesList from '@/components/home/HeadsClassesList';
import HeadsNoticesList from '@/components/home/HeadsNoticesList';
import { fetchReport } from '@/services/api';
import { todayISO, type ReportRow } from '@/services/domain';
import type { AdminStats, ClassStatus } from '@/types';

export type HeadsTab = 'overview' | 'attendance' | 'classes' | 'notices';
export type HeadsAttFilter = 'absent' | 'present';

const TABS: { key: HeadsTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'overview', label: 'Overview', icon: 'home-outline' },
  { key: 'attendance', label: 'Attendance', icon: 'people-outline' },
  { key: 'classes', label: 'Classes', icon: 'school-outline' },
  { key: 'notices', label: 'Notices', icon: 'mail-outline' },
];

export default function HeadsHome({
  role,
  stats,
  classes,
  onSync,
  onTabChange,
}: {
  role: 'principal' | 'section_head';
  stats?: AdminStats;
  classes?: ClassStatus[];
  onSync: () => void;
  onTabChange?: () => void;
}) {
  const [tab, setTab] = useState<HeadsTab>('overview');
  const [attFilter, setAttFilter] = useState<HeadsAttFilter>('absent');
  const [attRows, setAttRows] = useState<ReportRow[] | null>(null);
  const [attLoading, setAttLoading] = useState(false);
  const [attError, setAttError] = useState<string | null>(null);
  const roster = classes ?? [];
  const loadRef = useRef(false);
  const triedRef = useRef(false);

  // Today's rows for every class in scope, shared by the Attendance and
  // Classes tabs (no refetch per class). A section head only ever sees
  // their own roster — the filter is client-side, on the home data.
  const loadAttendance = useCallback(async () => {
    if (loadRef.current) return;
    loadRef.current = true;
    setAttLoading(true);
    setAttError(null);
    try {
      const result = await fetchReport({ type: 'daily', date: todayISO(), className: '' });
      const mine =
        role === 'section_head' ? new Set((classes ?? []).map((c) => c.className)) : null;
      setAttRows(mine ? result.rows.filter((r) => mine.has(r.className)) : result.rows);
    } catch (e: any) {
      setAttError(e?.message || 'Could not load attendance.');
      setAttRows(null);
    } finally {
      setAttLoading(false);
      loadRef.current = false;
    }
  }, [role, classes]);

  // Lazy: fetch once, the first time a list tab opens. Explicit Refresh on
  // the list re-runs the fetch; a failed first attempt is not retried
  // automatically (the list shows Retry instead).
  useEffect(() => {
    if ((tab === 'attendance' || tab === 'classes') && attRows === null && !triedRef.current) {
      triedRef.current = true;
      void loadAttendance();
    }
  }, [tab, attRows, loadAttendance]);

  const refreshAttendance = useCallback(() => {
    triedRef.current = true;
    void loadAttendance();
  }, [loadAttendance]);

  const openTab = useCallback(
    (next: HeadsTab, filter?: HeadsAttFilter) => {
      if (filter) setAttFilter(filter);
      setTab(next);
      onTabChange?.();
    },
    [onTabChange]
  );

  return (
    <View style={styles.root}>
      {tab === 'overview' && role === 'principal' && (
        <PrincipalHome stats={stats} classes={classes} onSync={onSync} onOpenTab={openTab} />
      )}
      {tab === 'overview' && role === 'section_head' && (
        <SectionHeadHome stats={stats} classes={classes} onSync={onSync} onOpenTab={openTab} />
      )}
      {tab === 'attendance' && (
        <HeadsAttendanceList
          classes={roster}
          role={role}
          rows={attRows}
          loading={attLoading}
          error={attError}
          onRefresh={refreshAttendance}
          initialFilter={attFilter}
          onBack={() => openTab('overview')}
        />
      )}
      {tab === 'classes' && (
        <HeadsClassesList classes={roster} rows={attRows} onBack={() => openTab('overview')} />
      )}
      {tab === 'notices' && <HeadsNoticesList onBack={() => openTab('overview')} />}

      <View style={styles.tabBar}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => openTab(t.key)}
              style={({ pressed }) => [styles.tabBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Ionicons
                name={t.icon}
                size={20}
                color={active ? COLORS.primary : COLORS.textFaint}
              />
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: SPACING.md },
  pressed: { opacity: 0.7 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.outline,
    paddingVertical: 6,
    ...SHADOW.card,
  },
  tabBtn: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 6 },
  tabLabel: { fontSize: 10.5, fontFamily: FONT.regular, color: COLORS.textFaint },
  tabLabelActive: { color: COLORS.primary },
});
