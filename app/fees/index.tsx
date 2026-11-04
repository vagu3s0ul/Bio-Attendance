/**
 * Fee dues (admin) — one row per student for a month: billed amount, amount
 * received, and an optional note. An all-zero row is deleted server-side, so
 * clearing both boxes removes the student from that month's defaulter list.
 *
 * Dues are typed in once a month (or imported from a CSV the office already
 * keeps) and the Defaulters → Fees tab does the WhatsApp reminders.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useRouter } from 'expo-router';
import AdminOnly from '@/components/AdminOnly';
import Screen from '@/components/Screen';
import AppBar from '@/components/AppBar';
import Card from '@/components/Card';
import { COLORS, FONT, LABEL_CAPS, RADIUS, SPACING } from '@/constants/theme';
import {
  fetchFeeDues,
  money,
  monthLabel,
  recentMonths,
  saveFeeDues,
  searchStudents,
} from '@/services/fees';
import type { StudentSearchHit } from '@/services/fees';
import { fetchReportClasses } from '@/services/api';
import { SessionExpiredError } from '@/types';

interface EditableRow {
  roll: string;
  name: string;
  amount: string;
  paid: string;
  note: string;
}

interface CsvEntry {
  amount?: number;
  paid?: number;
  note?: string;
}

/**
 * Parse a dues CSV. Accepts a header row in any order (roll/amount/paid/note)
 * or bare rows of roll,amount,paid[,note]. Returns roll -> values.
 */
export function parseFeeCsv(text: string): Map<string, CsvEntry> {
  const out = new Map<string, CsvEntry>();
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '');
  if (lines.length === 0) return out;

  const split = (line: string) => line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
  const first = split(lines[0]).map((c) => c.toLowerCase());

  const rollIdx = first.findIndex((c) => c === 'roll' || c === 'rollno' || c === 'roll_no');
  const hasHeader = rollIdx >= 0;
  const amountIdx = hasHeader ? first.findIndex((c) => c === 'amount' || c === 'due' || c === 'fee') : 1;
  const paidIdx = hasHeader ? first.findIndex((c) => c === 'paid' || c === 'received') : 2;
  const noteIdx = hasHeader ? first.findIndex((c) => c === 'note' || c === 'remarks') : 3;

  const start = hasHeader ? 1 : 0;
  for (let i = start; i < lines.length; i++) {
    const cells = split(lines[i]);
    const roll = (cells[rollIdx >= 0 ? rollIdx : 0] || '').trim();
    if (!roll) continue;
    const num = (idx: number): number | undefined => {
      if (idx < 0 || idx >= cells.length) return undefined;
      const raw = cells[idx].replace(/[^0-9.\-]/g, '');
      if (raw === '') return undefined;
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    };
    const entry: CsvEntry = {
      amount: num(amountIdx),
      paid: num(paidIdx),
      note: noteIdx >= 0 && noteIdx < cells.length ? cells[noteIdx] : undefined,
    };
    if (entry.amount === undefined && entry.paid === undefined) continue;
    out.set(roll, entry);
  }
  return out;
}

export default function FeeDuesScreen() {
  const router = useRouter();

  const [classes, setClasses] = useState<string[]>([]);
  const [className, setClassName] = useState('');
  const [months] = useState<string[]>(recentMonths(6));
  const [month, setMonth] = useState(recentMonths(1)[0]);

  const [rows, setRows] = useState<EditableRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [bulkAmount, setBulkAmount] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [hits, setHits] = useState<StudentSearchHit[]>([]);
  const [hitAmt, setHitAmt] = useState<Record<string, string>>({});
  const [searching, setSearching] = useState(false);
  const [canEdit, setCanEdit] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const list = await fetchReportClasses();
        if (!active) return;
        setClasses(list);
        setClassName((prev) => prev || list[0] || '');
      } catch (e: any) {
        if (e instanceof SessionExpiredError) {
          Alert.alert('Session expired', 'Please log in again.');
          return;
        }
        if (active) setErr(e?.message || 'Could not load classes.');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!className) return;
    setLoading(true);
    setErr(null);
    try {
      const data = await fetchFeeDues({ className, month });
      setCanEdit(data.canEdit !== false);
      setRows(
        data.rows.map((r) => ({
          roll: r.roll,
          name: r.name,
          amount: r.amount ? String(r.amount) : '',
          paid: r.paid ? String(r.paid) : '',
          note: r.note || '',
        }))
      );
    } catch (e: any) {
      if (e instanceof SessionExpiredError) {
        Alert.alert('Session expired', 'Please log in again.');
        return;
      }
      setErr(e?.message || 'Could not load fee dues.');
    } finally {
      setLoading(false);
    }
  }, [className, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    let due = 0;
    let paid = 0;
    for (const r of rows) {
      const a = Number(r.amount || 0);
      const p = Number(r.paid || 0);
      if (Number.isFinite(a)) due += a;
      if (Number.isFinite(p)) paid += p;
    }
    return { due, paid, balance: due - paid };
  }, [rows]);

  const update = (roll: string, key: 'amount' | 'paid', value: string) => {
    const clean = value.replace(/[^0-9.]/g, '');
    setRows((prev) => prev.map((r) => (r.roll === roll ? { ...r, [key]: clean } : r)));
  };

  const applyToAll = () => {
    const clean = bulkAmount.replace(/[^0-9.]/g, '');
    if (clean === '' || !Number.isFinite(Number(clean))) {
      Alert.alert('Amount', 'Type the monthly amount first, e.g. 5000.');
      return;
    }
    setRows((prev) => prev.map((r) => ({ ...r, amount: clean })));
  };

  const importCsv = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      const text = await FileSystem.readAsStringAsync(asset.uri);
      const parsed = parseFeeCsv(text);

      if (parsed.size === 0) {
        Alert.alert(
          'Nothing imported',
          'The file had no usable rows. Expected: roll,amount,paid — one student per line.'
        );
        return;
      }

      let applied = 0;
      setRows((prev) =>
        prev.map((r) => {
          const entry = parsed.get(r.roll);
          if (!entry) return r;
          applied++;
          return {
            ...r,
            amount: entry.amount !== undefined ? String(entry.amount) : r.amount,
            paid: entry.paid !== undefined ? String(entry.paid) : r.paid,
            note: entry.note !== undefined ? entry.note : r.note,
          };
        })
      );

      Alert.alert(
        'CSV imported',
        `${applied} of ${parsed.size} roll numbers matched this class. Tap Save to store the dues.`
      );
    } catch (e: any) {
      Alert.alert('Import failed', e?.message || 'Could not read that file.');
    }
  };

  const save = async () => {
    if (!className) return;

    const payload: { roll: string; amount: number; paid: number; note?: string }[] = [];
    for (const r of rows) {
      const amount = Number(r.amount || 0);
      const paid = Number(r.paid || 0);
      if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(paid) || paid < 0) {
        Alert.alert('Invalid amount', `Check the amounts for ${r.name} (Roll ${r.roll}).`);
        return;
      }
      if (amount === 0 && paid === 0 && !r.note.trim()) continue; // clears any old row
      payload.push({ roll: r.roll, amount, paid, note: r.note.trim() });
    }

    setSaving(true);
    try {
      const res = await saveFeeDues({ className, month, rows: payload });
      Alert.alert('Saved', res.message || 'Fee dues saved.');
      await load();
    } catch (e: any) {
      if (e instanceof SessionExpiredError) {
        Alert.alert('Session expired', 'Please log in again.');
        return;
      }
      Alert.alert('Save failed', e?.message || 'Could not save fee dues.');
    } finally {
      setSaving(false);
    }
  };

  const doSearch = async () => {
    const q = searchQ.trim();
    if (!q) return;
    setSearching(true);
    setErr(null);
    try {
      setHits(await searchStudents(q));
    } catch (e: any) {
      if (e instanceof SessionExpiredError) {
        Alert.alert('Session expired', 'Please log in again.');
        return;
      }
      setErr(e?.message || 'Search failed.');
    } finally {
      setSearching(false);
    }
  };

  const saveHit = async (hit: StudentSearchHit) => {
    const raw = (hitAmt[hit.roll] ?? '').replace(/[^0-9.]/g, '');
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) {
      Alert.alert('Amount', 'Enter a valid pending fee first.');
      return;
    }
    setSaving(true);
    try {
      await saveFeeDues({
        className: hit.class,
        month,
        rows: [{ roll: hit.roll, amount, paid: 0 }],
      });
      Alert.alert('Saved', `Set pending fee ${money(amount)} for ${hit.name} (${hit.class}).`);
      setHits([]);
      setSearchQ('');
      setHitAmt({});
    } catch (e: any) {
      if (e instanceof SessionExpiredError) {
        Alert.alert('Session expired', 'Please log in again.');
        return;
      }
      Alert.alert('Save failed', e?.message || 'Could not save this fee.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminOnly allow={['admin', 'accountant', 'teacher']}>
      <Screen edges={[]}>
        <AppBar />
        <View style={styles.headerBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Fee Dues</Text>
            <Text style={styles.headerSub} numberOfLines={1}>
              {className ? `Class ${className} · ${monthLabel(month)}` : 'Choose a class'}
              {rows.length > 0 ? ` · ${rows.length} students` : ''}
            </Text>
          </View>
        </View>

        <View style={styles.searchCard}>
          <Text style={[styles.inputLabel, LABEL_CAPS]}>Global search</Text>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.bulkInput}
              value={searchQ}
              onChangeText={setSearchQ}
              placeholder="Search any student by name or roll…"
              placeholderTextColor={COLORS.textFaint}
              returnKeyType="search"
              onSubmitEditing={doSearch}
            />
            <Pressable style={styles.bulkBtn} onPress={doSearch} disabled={searching}>
              {searching ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <Ionicons name="search" size={16} color={COLORS.primaryDeep} />
              )}
            </Pressable>
          </View>
          {hits.map((hit) => (
            <View key={`${hit.class}-${hit.roll}`} style={styles.hitRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.hitName} numberOfLines={1}>{hit.name}</Text>
                <Text style={styles.hitSub}>{hit.class} · Roll {hit.roll}</Text>
              </View>
              <TextInput
                style={styles.hitInput}
                value={hitAmt[hit.roll] ?? ''}
                onChangeText={(v) =>
                  setHitAmt((p) => ({ ...p, [hit.roll]: v.replace(/[^0-9.]/g, '') }))
                }
                placeholder="Pending fee"
                placeholderTextColor={COLORS.textFaint}
                keyboardType="numeric"
              />
              <Pressable style={styles.hitBtn} onPress={() => saveHit(hit)} disabled={saving}>
                <Text style={styles.hitBtnText}>Set</Text>
              </Pressable>
            </View>
          ))}
        </View>

        {classes.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
            {classes.map((c) => (
              <Pressable
                key={c}
                style={[styles.chip, className === c && styles.chipActive]}
                onPress={() => setClassName(c)}
              >
                <Text style={[styles.chipText, className === c && styles.chipTextActive]}>{c}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
          {months.map((m) => (
            <Pressable
              key={m}
              style={[styles.chip, month === m && styles.chipActive]}
              onPress={() => setMonth(m)}
            >
              <Text style={[styles.chipText, month === m && styles.chipTextActive]}>
                {monthLabel(m)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {err ? (
          <View style={styles.errBox}>
            <Ionicons name="alert-circle" size={16} color={COLORS.danger} />
            <Text style={styles.errText}>{err}</Text>
          </View>
        ) : null}

        {/* Apply one amount to the whole class + CSV import */}
        {canEdit ? (
        <View style={styles.bulkRow}>
          <TextInput
            style={styles.bulkInput}
            value={bulkAmount}
            onChangeText={(v) => setBulkAmount(v.replace(/[^0-9.]/g, ''))}
            placeholder="Monthly amount"
            placeholderTextColor={COLORS.textFaint}
            keyboardType="numeric"
          />
          <Pressable style={styles.bulkBtn} onPress={applyToAll}>
            <Text style={styles.bulkBtnText}>Apply to all</Text>
          </Pressable>
          <Pressable style={styles.importBtn} onPress={importCsv}>
            <Ionicons name="document-text-outline" size={15} color={COLORS.primary} />
            <Text style={styles.importText}>CSV</Text>
          </Pressable>
        </View>
        ) : null}

        <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
          {loading && rows.length === 0 ? (
            <ActivityIndicator style={{ marginTop: 24 }} color={COLORS.primary} />
          ) : null}

          {!loading && rows.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No students in this class</Text>
              <Text style={styles.emptyBody}>Add students in Manage, then come back here.</Text>
            </Card>
          ) : null}

          {rows.map((row) => (
            <Card key={row.roll} style={styles.rowCard}>
              <View style={styles.rowTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName} numberOfLines={1}>{row.name}</Text>
                  <Text style={styles.rowRoll}>Roll {row.roll}</Text>
                </View>
                <Text style={styles.balanceBig}>
                  {money(Number(row.amount || 0) - Number(row.paid || 0))}
                </Text>
              </View>
              <View style={styles.inputRow}>
                <View style={styles.inputWrap}>
                  <Text style={[styles.inputLabel, LABEL_CAPS]}>Due</Text>
                  <TextInput
                    style={styles.input}
                    value={row.amount}
                    editable={canEdit}
                    onChangeText={(v) => update(row.roll, 'amount', v)}
                    placeholder="0"
                    placeholderTextColor={COLORS.textFaint}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.inputWrap}>
                  <Text style={[styles.inputLabel, LABEL_CAPS]}>Paid</Text>
                  <TextInput
                    style={styles.input}
                    value={row.paid}
                    editable={canEdit}
                    onChangeText={(v) => update(row.roll, 'paid', v)}
                    placeholder="0"
                    placeholderTextColor={COLORS.textFaint}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            </Card>
          ))}

          <View style={{ height: 110 }} />
        </ScrollView>

        <View style={styles.bottomBar}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsText}>Due {money(totals.due)}</Text>
            <Text style={styles.totalsText}>Paid {money(totals.paid)}</Text>
            <Text style={styles.totalsStrong}>Pending {money(totals.balance)}</Text>
          </View>
          {canEdit ? (
          <Pressable
            style={[styles.saveBtn, (saving || !className) && styles.saveBtnDisabled]}
            onPress={save}
            disabled={saving || !className}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="save-outline" size={17} color="#fff" />
                <Text style={styles.saveText}>Save {monthLabel(month)} dues</Text>
              </>
            )}
          </Pressable>
          ) : (
            <Text style={{ color: COLORS.textMuted, fontSize: 13, fontFamily: FONT.regular }}>
              View only — fee dues are updated by the Accountant/Admin.
            </Text>
          )}
          <Pressable style={styles.linkRow} onPress={() => router.push('/defaulters')}>
            <Ionicons name="logo-whatsapp" size={14} color={COLORS.compliant} />
            <Text style={styles.linkText}>Open defaulters &amp; send reminders</Text>
          </Pressable>
        </View>
      </Screen>
    </AdminOnly>
  );
}

const styles = StyleSheet.create({
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  headerTitle: {
    fontSize: 21,
    fontFamily: FONT.bold,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.4,
  },
  headerSub: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 2, fontFamily: FONT.regular },

  chipRow: { gap: 8, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm },
  chipScroll: { flexGrow: 0 },
  chip: {
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
  },
  chipActive: { backgroundColor: COLORS.primarySoft },
  chipText: { fontSize: 12, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.textMuted },
  chipTextActive: { color: COLORS.primaryDeep },

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

  bulkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  bulkInput: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    fontFamily: FONT.regular,
    color: COLORS.text,
  },
  bulkBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primarySoft,
  },
  bulkBtnText: { fontSize: 12, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.primaryDeep },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surface,
  },
  importText: { fontSize: 12, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.primary },

  scroll: { flex: 1 },
  list: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.xs, gap: SPACING.sm },

  emptyCard: { alignItems: 'center', gap: 6, paddingVertical: 22 },
  emptyTitle: { fontSize: 15, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  emptyBody: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center' },

  rowCard: { padding: 14, gap: 8, borderRadius: 20 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rowName: { flex: 1, fontSize: 15, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  rowRoll: { fontSize: 11, color: COLORS.textMuted, fontFamily: FONT.regular, marginTop: 1 },
  balanceBig: { fontSize: 18, fontFamily: FONT.bold, color: COLORS.primaryDeep },
  inputRow: { flexDirection: 'row', gap: 10 },
  inputWrap: { flex: 1, gap: 4 },
  inputLabel: { fontSize: 10 },
  input: {
    backgroundColor: COLORS.surfaceLow,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: FONT.regular,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.outline,
  },

  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: SPACING.md,
    paddingBottom: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.outline,
    gap: 8,
  },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalsText: { fontSize: 11, color: COLORS.textMuted, fontFamily: FONT.regular },
  totalsStrong: { fontSize: 11, color: COLORS.text, fontFamily: FONT.medium, fontWeight: '600' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveText: { color: COLORS.onPrimary, fontSize: 14, fontFamily: FONT.medium, fontWeight: '600' },
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 4 },
  linkText: { fontSize: 12, color: COLORS.compliant, fontFamily: FONT.medium, fontWeight: '600' },

  searchCard: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    padding: 12,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    gap: 8,
  },
  searchRow: { flexDirection: 'row', gap: 8 },
  hitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.outline,
  },
  hitName: { fontSize: 13, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  hitSub: { fontSize: 11, color: COLORS.textMuted, fontFamily: FONT.regular, marginTop: 1 },
  hitInput: {
    width: 96,
    backgroundColor: COLORS.surfaceLow,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: FONT.regular,
    color: COLORS.text,
  },
  hitBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
  },
  hitBtnText: { color: COLORS.onPrimary, fontSize: 12, fontFamily: FONT.medium, fontWeight: '600' },
});
