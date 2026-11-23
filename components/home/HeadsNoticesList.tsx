/**
 * Heads' Notices list — the notices feed, with expandable bodies and a
 * per-notice "Mark read" (same API as the Section Head inbox preview).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, FONT, SPACING } from '@/constants/theme';
import { Panel, Pill } from '@/components/UI';
import { fetchNotices, markNoticesRead, type Notice } from '@/services/api';

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

export default function HeadsNoticesList({ onBack }: { onBack: () => void }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setNotices(await fetchNotices());
    } catch (e: any) {
      setError(e?.message || 'Could not load notices.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Same pattern as the Section Head inbox: only flip the row once the
  // server has accepted the mark-read.
  const markRead = (id: number) => {
    void markNoticesRead([id]).then(() =>
      setNotices((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    );
  };

  const unread = notices.filter((n) => !n.read).length;

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Back to overview"
        >
          <Ionicons name="chevron-back" size={18} color={COLORS.text} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title}>Notices</Text>
          <Text style={styles.scope}>Campus-wide circulars &amp; orders</Text>
        </View>
        {unread > 0 ? (
          <Pill label={`${unread} New`} tone="rose" solid />
        ) : (
          <Pill label="All Read" tone="mint" />
        )}
      </View>

      {loading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={styles.stateText}>Loading notices…</Text>
        </View>
      ) : error ? (
        <View style={styles.stateBox}>
          <Text style={styles.errText}>{error}</Text>
          <Pressable onPress={() => void load()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : notices.length === 0 ? (
        <View style={styles.stateBox}>
          <Text style={styles.stateText}>No notices yet.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {notices.map((n) => {
            const open = expanded.has(n.id);
            return (
              <Panel key={n.id} style={styles.card}>
                <Pressable
                  onPress={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(n.id)) next.delete(n.id);
                      else next.add(n.id);
                      return next;
                    })
                  }
                >
                  <View style={styles.noticeTop}>
                    <View style={n.read ? styles.dotOff : styles.dot} />
                    <Text style={styles.subject} numberOfLines={open ? undefined : 1}>
                      {n.subject || '(no subject)'}
                    </Text>
                    <Text style={styles.time}>{relTime(n.created_at)}</Text>
                  </View>
                  <Text style={styles.body} numberOfLines={open ? undefined : 2}>
                    {n.body}
                  </Text>
                </Pressable>
                <View style={styles.foot}>
                  <Text style={styles.from} numberOfLines={1}>
                    {n.from || 'Campus Office'}
                  </Text>
                  <View style={styles.flex} />
                  {!n.read ? (
                    <Pressable
                      onPress={() => markRead(n.id)}
                      style={({ pressed }) => [styles.readBtn, pressed && styles.pressed]}
                    >
                      <Ionicons name="checkmark-done" size={12} color={COLORS.primary} />
                      <Text style={styles.readBtnText}>Mark read</Text>
                    </Pressable>
                  ) : null}
                </View>
              </Panel>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: SPACING.md },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },

  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 16, fontFamily: FONT.display, fontWeight: '300', color: COLORS.text },
  scope: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 2, fontFamily: FONT.regular },

  stateBox: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  stateText: { fontSize: 13, color: COLORS.textMuted, fontFamily: FONT.regular, textAlign: 'center' },
  errText: { fontSize: 13, color: COLORS.danger, fontFamily: FONT.regular, textAlign: 'center' },
  retryBtn: {
    minHeight: 40,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { fontSize: 13, fontFamily: FONT.regular, color: '#fff' },

  list: { gap: SPACING.md },
  card: { gap: 6 },
  noticeTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.danger },
  dotOff: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.outline },
  subject: { flex: 1, fontSize: 13.5, fontFamily: FONT.regular, color: COLORS.text },
  time: { fontSize: 11, color: COLORS.textFaint, fontFamily: FONT.regular },
  body: { fontSize: 12, color: COLORS.textMuted, lineHeight: 17, fontFamily: FONT.regular, marginTop: 4 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  from: { fontSize: 11, color: COLORS.textFaint, fontFamily: FONT.regular, flexShrink: 1 },
  readBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 26,
    paddingHorizontal: 9,
    borderRadius: 9,
    backgroundColor: COLORS.primarySoft,
  },
  readBtnText: { fontSize: 10.5, fontFamily: FONT.regular, color: COLORS.primary },
});
