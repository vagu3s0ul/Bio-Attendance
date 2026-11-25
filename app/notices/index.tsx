import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import Screen from '@/components/Screen';
import AppBar from '@/components/AppBar';
import { IconTile, Panel, Pill } from '@/components/UI';
import { COLORS, FONT, RADIUS, SPACING } from '@/constants/theme';
import { fetchNotices, markNoticesRead, Notice } from '@/services/api';
import { SessionExpiredError } from '@/types';

function prettyDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Sender category → pastel tone + icon for the notice card header. */
function senderStyle(from: string): { tone: 'rose' | 'peach' | 'sky' | 'violet' | 'mint'; icon: any } {
  const f = (from || '').toLowerCase();
  if (f.includes('principal')) return { tone: 'rose', icon: 'shield-checkmark-outline' };
  if (f.includes('head')) return { tone: 'peach', icon: 'ribbon-outline' };
  if (f.includes('account') || f.includes('bursar')) return { tone: 'sky', icon: 'calculator-outline' };
  if (f.includes('admin') || f.includes('it')) return { tone: 'violet', icon: 'settings-outline' };
  return { tone: 'mint', icon: 'megaphone-outline' };
}

export default function NoticesScreen() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [query, setQuery] = useState('');

  const load = useCallback(async (markAll = false) => {
    setLoading(true);
    setErr(null);
    try {
      const list = await fetchNotices();
      setNotices(list);
      if (markAll) {
        const unread = list.filter((n) => !n.read).map((n) => n.id);
        if (unread.length) {
          await markNoticesRead(unread);
          setNotices(list.map((n) => ({ ...n, read: true })));
        }
      }
    } catch (e: any) {
      if (e instanceof SessionExpiredError) {
        Alert.alert('Session expired', 'Please log in again.');
        return;
      }
      setErr(e?.message || 'Could not load notices.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load])
  );

  const unread = notices.filter((n) => !n.read).length;

  const senders = useMemo(() => {
    const set = new Map<string, number>();
    for (const n of notices) {
      const key = n.from || 'Unknown';
      set.set(key, (set.get(key) ?? 0) + 1);
    }
    return Array.from(set.entries());
  }, [notices]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notices.filter((n) => {
      if (filter !== 'all' && (n.from || 'Unknown') !== filter) return false;
      if (!q) return true;
      return (
        (n.subject || '').toLowerCase().includes(q) ||
        (n.body || '').toLowerCase().includes(q) ||
        (n.from || '').toLowerCase().includes(q)
      );
    });
  }, [notices, filter, query]);

  const markAll = async () => {
    setMarking(true);
    await load(true);
    setMarking(false);
  };

  return (
    <Screen>
      <AppBar />
      <View style={styles.headBar}>
        <View style={styles.flex}>
          <Text style={styles.title}>Notices &amp; Circulars</Text>
          <Text style={styles.sub}>{unread > 0 ? `${unread} unread` : 'All caught up'}</Text>
        </View>
        {unread > 0 ? <Pill label={`${unread} New`} tone="rose" solid /> : null}
        <Pressable
          onPress={markAll}
          disabled={!unread || marking}
          style={[styles.markBtn, (!unread || marking) && styles.markBtnOff]}
        >
          {marking ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <>
              <Ionicons name="checkmark-done" size={15} color={COLORS.primary} />
              <Text style={styles.markText}>Mark all read</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filters}
      >
        <Pressable
          onPress={() => setFilter('all')}
          style={[styles.filterChip, filter === 'all' && styles.filterChipOn]}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextOn]}>
            All Notices
          </Text>
          <View style={[styles.filterCount, filter === 'all' && styles.filterCountOn]}>
            <Text style={[styles.filterCountText, filter === 'all' && styles.filterCountTextOn]}>
              {notices.length}
            </Text>
          </View>
        </Pressable>
        {senders.map(([name, count]) => (
          <Pressable
            key={name}
            onPress={() => setFilter(name)}
            style={[styles.filterChip, filter === name && styles.filterChipOn]}
          >
            <Text
              style={[styles.filterText, filter === name && styles.filterTextOn]}
              numberOfLines={1}
            >
              {name}
            </Text>
            <View style={[styles.filterCount, filter === name && styles.filterCountOn]}>
              <Text style={[styles.filterCountText, filter === name && styles.filterCountTextOn]}>
                {count}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={COLORS.textFaint} />
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search notices, circulars, senders…"
          placeholderTextColor={COLORS.textFaint}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={17} color={COLORS.textFaint} />
          </Pressable>
        ) : (
          <Ionicons name="options-outline" size={17} color={COLORS.textFaint} />
        )}
      </View>

      {err ? (
        <View style={styles.errBox}>
          <Ionicons name="alert-circle" size={16} color={COLORS.danger} />
          <Text style={styles.errText}>{err}</Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {loading && notices.length === 0 ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={COLORS.primary} />
        ) : null}

        {!loading && visible.length === 0 ? (
          <Text style={styles.empty}>
            {notices.length === 0 ? 'No notices for you yet.' : 'No notices match this filter.'}
          </Text>
        ) : null}

        {visible.map((n) => {
          const s = senderStyle(n.from);
          const isOrder = (n.from || '').toLowerCase().includes('principal');
          return (
            <Panel key={n.id} style={[styles.card, !n.read && styles.cardUnread, isOrder && styles.cardOrder]}>
              <View style={styles.cardHead}>
                <IconTile icon={s.icon} tone={s.tone} size={40} radius={13} iconSize={18} />
                <View style={styles.flex}>
                  <Text style={styles.sender} numberOfLines={1}>
                    {n.from || 'Campus Office'}
                  </Text>
                  <Text style={styles.senderSub} numberOfLines={1}>
                    {s.tone === 'rose'
                      ? 'SPS Sialkot Secretariat'
                      : s.tone === 'peach'
                      ? 'Wing Administration'
                      : s.tone === 'sky'
                      ? 'Finance Wing'
                      : 'Campus Administration'}
                  </Text>
                </View>
                <Text style={styles.time}>{prettyDate(n.created_at)}</Text>
                {!n.read ? <View style={styles.dot} /> : null}
              </View>

              {isOrder ? (
                <View style={styles.orderPill}>
                  <Ionicons name="shield-checkmark" size={11} color={COLORS.primary} />
                  <Text style={styles.orderPillText}>PRINCIPAL ORDER</Text>
                </View>
              ) : null}
              <Text style={styles.subject} numberOfLines={2}>
                {n.subject || '(no subject)'}
              </Text>
              <Text style={styles.body} numberOfLines={3}>
                {n.body}
              </Text>

              <View style={styles.cardFoot}>
                <Pill
                  label={!n.read ? 'Unread' : 'Read'}
                  tone={!n.read ? 'rose' : 'slate'}
                  icon={!n.read ? 'alert-circle-outline' : 'checkmark-outline'}
                />
                <View style={styles.flex} />
                <Pressable
                  onPress={() =>
                    Alert.alert(n.subject || 'Notice', `${n.body}\n\n— ${n.from || 'Campus Office'}`)
                  }
                  hitSlop={8}
                  style={styles.iconBtn}
                >
                  <Ionicons name="expand-outline" size={16} color={COLORS.textMuted} />
                </Pressable>
              </View>
            </Panel>
          );
        })}
        <View style={{ height: 12 }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  title: {
    fontSize: 21,
    fontFamily: FONT.display,
    fontWeight: '300',
    color: COLORS.text,
    letterSpacing: -0.4,
  },
  sub: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 2, fontFamily: FONT.regular },
  markBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  markBtnOff: { opacity: 0.45 },
  markText: { fontSize: 12.5, fontFamily: FONT.regular, fontWeight: '400', color: COLORS.primary },

  filters: { gap: 8, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md },
  filterScroll: { flexGrow: 0 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 13,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
  },
  filterChipOn: { backgroundColor: COLORS.primary },
  filterText: { fontSize: 13, fontFamily: FONT.regular, fontWeight: '400', color: COLORS.text },
  filterTextOn: { color: '#fff' },
  filterCount: {
    minWidth: 19,
    height: 19,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: COLORS.field,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCountOn: { backgroundColor: 'rgba(255,255,255,0.24)' },
  filterCountText: { fontSize: 10.5, fontFamily: FONT.regular, fontWeight: '400', color: COLORS.textMuted },
  filterCountTextOn: { color: '#fff' },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
  },
  search: { flex: 1, fontSize: 14, color: COLORS.text, fontFamily: FONT.regular },

  errBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    padding: 10,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.dangerSoft,
  },
  errText: { flex: 1, fontSize: 12, color: COLORS.danger, fontFamily: FONT.regular },

  list: { paddingHorizontal: SPACING.lg, gap: 12 },
  empty: {
    textAlign: 'center',
    color: COLORS.textMuted,
    marginTop: 40,
    fontFamily: FONT.regular,
  },
  card: { gap: 8 },
  cardUnread: { borderWidth: 1, borderColor: COLORS.primarySoft },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sender: { fontSize: 13.5, fontFamily: FONT.regular, fontWeight: '400', color: COLORS.text },
  cardOrder: { borderLeftWidth: 3, borderLeftColor: COLORS.primary },
  orderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    backgroundColor: COLORS.primarySoft,
    borderRadius: RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 6,
  },
  orderPillText: {
    fontSize: 9.5,
    fontFamily: FONT.medium,
    fontWeight: '600',
    color: COLORS.primary,
    letterSpacing: 0.6,
  },
  senderSub: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 1, fontFamily: FONT.regular },
  time: { fontSize: 11, color: COLORS.textFaint, fontFamily: FONT.regular },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  subject: {
    fontSize: 13.5,
    fontFamily: FONT.regular,
    fontWeight: '400',
    color: COLORS.text,
    letterSpacing: -0.3,
    lineHeight: 19,
  },
  body: { fontSize: 13.5, color: COLORS.textMuted, lineHeight: 20, fontFamily: FONT.regular },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORS.field,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
