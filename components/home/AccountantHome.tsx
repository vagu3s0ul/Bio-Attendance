/**
 * Accounts / bursar desk home — the 2026 accountant dashboard.
 *
 * Everything shown is real server data: the outstanding-due hero is the sum of
 * current-month defaulters across all classes, the critical list is the top of
 * that same defaulter roll, and Verify Slip marks a student fully paid through
 * fee/save, which clears them from every defaulter view school-wide.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { COLORS, FONT, RADIUS, SHADOW, SPACING } from '@/constants/theme';
import { IconTile, Panel, QuickTile, SectionHeader, StatTile, Pill } from '@/components/UI';
import {
  applyDuesFile,
  fetchFeeDefaulters,
  feesFileTypes,
  markFeePaid,
  money,
  monthLabel,
  parseFeeFile,
  saveFeeDues,
  thisMonth,
} from '@/services/fees';
import { useSession } from '@/store/session';
import { SessionExpiredError } from '@/types';

interface DuesRow {
  className: string;
  roll: string;
  name: string;
  amount: number;
  paid: number;
  balance: number;
  note: string;
}

export default function AccountantHome({
  students,
  deadline,
  classes,
  onSync,
}: {
  students: number;
  deadline: string;
  classes: string[];
  onSync: () => void;
}) {
  const router = useRouter();
  const { user } = useSession();

  const month = useMemo(() => thisMonth(), []);
  const [dues, setDues] = useState<DuesRow[]>([]);
  const [loadingDues, setLoadingDues] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);

  const [savingRoll, setSavingRoll] = useState<string | null>(null);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);

  const [editing, setEditing] = useState<DuesRow | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editPaid, setEditPaid] = useState('');
  const [editBusy, setEditBusy] = useState(false);

  const deadlineText = deadline || '09:30 AM';

  const loadDues = useCallback(async () => {
    if (!classes || classes.length === 0) {
      setDues([]);
      setSyncedAt(new Date());
      return;
    }
    setLoadingDues(true);
    setErr(null);
    try {
      const results = await Promise.all(
        classes.map((c) =>
          fetchFeeDefaulters({ className: c, month })
            .then((res) => ({ ...res, className: res.className || c }))
            .catch((e: any) => {
              if (e instanceof SessionExpiredError) throw e;
              return null;
            })
        )
      );
      const merged: DuesRow[] = [];
      for (const res of results) {
        if (!res) continue;
        for (const row of res.rows) {
          const balance = Number(row.balance) || 0;
          if (balance <= 0) continue;
          merged.push({
            className: res.className,
            roll: row.roll,
            name: row.name,
            amount: row.amount,
            paid: row.paid,
            balance,
            note: row.note || '',
          });
        }
      }
      merged.sort((a, b) => b.balance - a.balance);
      setDues(merged);
      setSyncedAt(new Date());
    } catch (e: any) {
      if (e instanceof SessionExpiredError) {
        Alert.alert('Session expired', 'Please log in again.');
        return;
      }
      setErr(e?.message || 'Could not load the outstanding dues.');
    } finally {
      setLoadingDues(false);
    }
  }, [classes, month]);

  React.useEffect(() => {
    void loadDues();
  }, [loadDues]);

  const outstanding = dues.reduce((sum, r) => sum + r.balance, 0);

  const reSync = () => {
    void loadDues();
    onSync();
  };

  // ---------------------------------------------------------------------------
  // Verify a slip: full confirmation, then mark the fee paid school-wide
  // ---------------------------------------------------------------------------

  const doVerify = async (row: DuesRow) => {
    setSavingRoll(row.roll);
    try {
      await markFeePaid({
        className: row.className,
        month,
        roll: row.roll,
        amount: row.amount,
      });
      Alert.alert('Slip verified', `${money(row.balance)} marked paid for ${row.name}.`);
      await loadDues();
    } catch (e: any) {
      if (e instanceof SessionExpiredError) {
        Alert.alert('Session expired', 'Please log in again.');
        return;
      }
      Alert.alert('Could not verify', e?.message || 'The server did not accept the verify request.');
    } finally {
      setSavingRoll(null);
    }
  };

  const askVerify = (row: DuesRow) => {
    Alert.alert(
      'Verify this slip?',
      `${row.name} (Roll ${row.roll} · ${row.className})\n\nOutstanding: ${money(
        row.balance
      )}\n\nMarking the slip as verified pays this fee in full. The student leaves the defaulters list and the payment shows as received to every teacher, head and to the principal.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Verify Slip', style: 'destructive', onPress: () => doVerify(row) },
      ]
    );
  };

  // ---------------------------------------------------------------------------
  // Manual per-student fee edit (modal)
  // ---------------------------------------------------------------------------

  const openEdit = (row: DuesRow) => {
    setEditing(row);
    setEditAmount(String(Math.round(row.amount)));
    setEditPaid(String(Math.round(row.paid)));
  };

  const saveEdit = async () => {
    if (!editing) return;
    const amount = Number(editAmount.replace(/[^0-9.]/g, ''));
    const paid = Number(editPaid.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(paid) || paid < 0) {
      setErr('Enter valid amounts (0 or more).');
      return;
    }
    setEditBusy(true);
    try {
      await saveFeeDues({
        className: editing.className,
        month,
        rows: [{ roll: editing.roll, amount, paid }],
      });
      setEditing(null);
      Alert.alert('Saved', `Updated dues for ${editing.name}.`);
      await loadDues();
    } catch (e: any) {
      if (e instanceof SessionExpiredError) {
        Alert.alert('Session expired', 'Please log in again.');
        return;
      }
      Alert.alert('Save failed', e?.message || 'Could not save these amounts.');
    } finally {
      setEditBusy(false);
    }
  };

  // ---------------------------------------------------------------------------
  // XLS/CSV upload: roll number + pending fee, looked up campus-wide
  // ---------------------------------------------------------------------------

  const pickAndUpload = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: feesFileTypes(),
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.length) return;
      const file = res.assets[0];

      const entries = await parseFeeFile({ name: file.name || 'dues.csv', uri: file.uri });
      if (entries.size === 0) {
        Alert.alert(
          'No usable rows',
          'Expected a roll number plus the pending fee. Covered formats: CSV, XLS, XLSX.'
        );
        return;
      }

      setUploading({ done: 0, total: entries.size });
      const result = await applyDuesFile(entries, month, (done, total) =>
        setUploading({ done, total })
      );

      Alert.alert(
        'Dues uploaded',
        `${result.applied} student${result.applied === 1 ? '' : 's'} matched by roll number and given dues for ${monthLabel(
          month
        )}. ${result.skipped} row${result.skipped === 1 ? '' : 's'} matched no roll number.`
      );
      await loadDues();
    } catch (e: any) {
      if (e instanceof SessionExpiredError) {
        Alert.alert('Session expired', 'Please log in again.');
        return;
      }
      Alert.alert('Upload failed', e?.message || 'Could not read that file.');
    } finally {
      setUploading(null);
    }
  };

  // ---------------------------------------------------------------------------

  const monthLabel_ = monthLabel(month);

  return (
    <View style={styles.root}>
      {/* Greeting */}
      <Panel style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.liveWrap}>
            <View style={styles.liveDot} />
            <Text style={styles.liveLabel}>ACCOUNTS DESK</Text>
          </View>
          <Pill label={monthLabel_} tone="lavender" icon="calendar-outline" />
        </View>
        <Text style={styles.heroTitle} numberOfLines={2}>
          Assalam-o-Alaikum, {user?.name || 'Accountant'}
        </Text>
        <Text style={styles.heroSub}>Senior Bursar • Accounts Desk</Text>

        <View style={styles.syncRow}>
          <IconTile icon="sync-outline" tone="slate" size={36} radius={12} iconSize={18} />
          <View style={styles.flex}>
            <Text style={styles.syncTitle} numberOfLines={1}>
              Fee Ledger Synced
            </Text>
            <Text style={styles.syncSub} numberOfLines={1}>
              {syncedAt
                ? `Updated ${syncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'Pull the latest balances'}
            </Text>
          </View>
          <Pressable
            onPress={reSync}
            style={({ pressed }) => [styles.syncBtn, pressed && styles.pressed]}
          >
            <Text style={styles.syncBtnText}>Re-Sync</Text>
          </Pressable>
        </View>
      </Panel>

      {/* Snapshot — real numbers only */}
      <View style={styles.grid}>
        <View style={styles.gridRow}>
          <StatTile
            label="Total Outstanding"
            value={loadingDues ? '—' : money(outstanding)}
            sub={`Across ${dues.length} defaulters`}
            icon="warning-outline"
            tone="rose"
            valueColor={COLORS.danger}
            badge={loadingDues ? undefined : outstanding > 0 ? 'Due' : 'Clear'}
            badgeTone={outstanding > 0 ? 'rose' : 'mint'}
          />
          <StatTile
            label="Enrolled Students"
            value={students?.toLocaleString() ?? '—'}
            sub="Across all sections"
            icon="people-outline"
            tone="lavender"
          />
        </View>
        <View style={styles.gridRow}>
          <StatTile
            label="Attendance Cutoff"
            value={deadlineText}
            sub="Late marks need sign-off"
            icon="time-outline"
            tone="sky"
          />
          <StatTile
            label="Billing Period"
            value={monthLabel_}
            sub="Current dues cycle"
            icon="calendar-outline"
            tone="peach"
          />
        </View>
      </View>

      {err ? (
        <View style={styles.errBox}>
          <Ionicons name="alert-circle" size={16} color={COLORS.danger} />
          <Text style={styles.errText}>{err}</Text>
        </View>
      ) : null}

      {/* Operations hub — Fee Ledger and Assign Dues only */}
      <SectionHeader title="Financial Operations Hub" sub="Bursar desk" style={styles.section} />
      <View style={styles.grid}>
        <View style={styles.gridRow}>
          <QuickTile
            icon="book-outline"
            title="Fee Ledger"
            subtitle="Full roster balances"
            tone="lavender"
            columns={2}
            onPress={() => router.push('/fees')}
          />
          <QuickTile
            icon="add-circle-outline"
            title="Assign Dues"
            subtitle="Grade or batch wide"
            tone="sky"
            columns={2}
            onPress={() => router.push('/fees')}
          />
        </View>
      </View>

      {/* Spreadsheet upload */}
      <Pressable
        onPress={pickAndUpload}
        disabled={!!uploading}
        style={({ pressed }) => [
          styles.uploadBtn,
          pressed && styles.pressed,
          uploading && styles.busy,
        ]}
      >
        <IconTile
          icon="cloud-upload-outline"
          tone="peach"
          size={40}
          radius={13}
          iconSize={19}
        />
        <View style={styles.flex}>
          <Text style={styles.uploadTitle}>
            {uploading ? `Uploading ${uploading.done}/${uploading.total}...` : 'Upload Dues (XLS / CSV)'}
          </Text>
          <Text style={styles.uploadSub} numberOfLines={1}>
            Roll number + pending fee — matched to students automatically
          </Text>
        </View>
        {uploading ? (
          <ActivityIndicator size="small" color={COLORS.primary} />
        ) : (
          <Ionicons name="chevron-forward" size={18} color={COLORS.textFaint} />
        )}
      </Pressable>

      {/* Critical dues & slip audits — real defaulters, top five */}
      <SectionHeader
        title="Critical Dues & Slip Audits"
        sub={monthLabel_}
        action={dues.length > 0 ? `View all ${dues.length}` : undefined}
        onAction={() => router.push('/fees')}
        style={styles.section}
      />

      {loadingDues && dues.length === 0 ? (
        <Panel style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </Panel>
      ) : null}

      {!loadingDues && dues.length === 0 && !err ? (
        <Panel style={styles.allClear}>
          <IconTile icon="checkmark-circle-outline" tone="mint" size={40} radius={13} iconSize={20} />
          <Text style={styles.clearTitle}>All caught up</Text>
          <Text style={styles.clearSub}>No outstanding dues for {monthLabel_}.</Text>
        </Panel>
      ) : null}

      {dues.length > 0 ? (
        <View style={styles.slipList}>
          {dues.slice(0, 5).map((row) => (
            <Panel key={`${row.className}-${row.roll}`} style={styles.slipCard}>
              <View style={styles.slipTop}>
                <View style={styles.flex}>
                  <Text style={styles.slipName} numberOfLines={1}>
                    {row.name}
                  </Text>
                  <Text style={styles.slipSub} numberOfLines={1}>
                    {row.className} · Roll {row.roll}
                    {row.note.trim() ? ` · ${row.note.trim()}` : ''}
                  </Text>
                </View>
                <Text style={styles.slipAmount}>{money(row.balance)}</Text>
              </View>
              <View style={styles.slipActions}>
                <Pressable
                  onPress={() => openEdit(row)}
                  style={({ pressed }) => [styles.editBtn, pressed && styles.pressed]}
                >
                  <Ionicons name="create-outline" size={14} color={COLORS.primary} />
                  <Text style={styles.editText}>Edit</Text>
                </Pressable>
                <Pressable
                  onPress={() => askVerify(row)}
                  disabled={savingRoll === row.roll}
                  style={({ pressed }) => [
                    styles.verifyBtn,
                    pressed && styles.pressed,
                    savingRoll === row.roll && styles.busy,
                  ]}
                >
                  {savingRoll === row.roll ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-done" size={14} color="#fff" />
                      <Text style={styles.verifyText}>Verify Slip</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </Panel>
          ))}
        </View>
      ) : null}

      <View style={{ height: 84 }} />

      {/* Manual per-student edit */}
      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Update pending fee</Text>
            <Text style={styles.modalSub}>
              {editing?.name} (Roll {editing?.roll} · {editing?.className})
            </Text>
            <View style={styles.inputRow}>
              <View style={styles.inputWrap}>
                <Text style={styles.inputLabel}>DUE (billed)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={editAmount}
                  onChangeText={(v) => setEditAmount(v.replace(/[^0-9.]/g, ''))}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={COLORS.textFaint}
                />
              </View>
              <View style={styles.inputWrap}>
                <Text style={styles.inputLabel}>PAID (received)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={editPaid}
                  onChangeText={(v) => setEditPaid(v.replace(/[^0-9.]/g, ''))}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={COLORS.textFaint}
                />
              </View>
            </View>
            {err ? <Text style={styles.modalErr}>{err}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setEditing(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.modalSave,
                  pressed && styles.pressed,
                  editBusy && styles.busy,
                ]}
                onPress={saveEdit}
                disabled={editBusy}
              >
                <Text style={styles.modalSaveText}>{editBusy ? 'Saving...' : 'Save'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: SPACING.lg },
  flex: { flex: 1 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  busy: { opacity: 0.7 },

  hero: { gap: 8 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.primary },
  liveLabel: {
    fontSize: 11,
    letterSpacing: 0.8,
    fontFamily: FONT.medium,
    fontWeight: '600',
    color: COLORS.primary,
  },
  heroTitle: {
    fontSize: 21,
    fontFamily: FONT.bold,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.4,
  },
  heroSub: { fontSize: 13, color: COLORS.textMuted, fontFamily: FONT.regular },

  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    backgroundColor: COLORS.field,
    borderRadius: 16,
    padding: 10,
  },
  syncTitle: { fontSize: 13.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  syncSub: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 1, fontFamily: FONT.regular },
  syncBtn: {
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 11,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncBtnText: { fontSize: 12.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.primary },

  grid: { gap: SPACING.md },
  gridRow: { flexDirection: 'row', gap: SPACING.md },
  section: { marginTop: 4 },

  errBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.dangerSoft,
  },
  errText: { flex: 1, fontSize: 12, color: COLORS.danger, fontFamily: FONT.regular },

  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 14,
    ...SHADOW.card,
  },
  uploadTitle: { fontSize: 14.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  uploadSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2, fontFamily: FONT.regular },

  center: { alignItems: 'center', paddingVertical: 22 },
  allClear: { alignItems: 'center', gap: 6, paddingVertical: 18 },
  clearTitle: { fontSize: 15, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  clearSub: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center' },

  slipList: { gap: SPACING.sm },
  slipCard: { padding: 14, gap: 10 },
  slipTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  slipName: { fontSize: 14.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  slipSub: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 2, fontFamily: FONT.regular },
  slipAmount: { fontSize: 17, fontFamily: FONT.bold, fontWeight: '700', color: COLORS.danger },
  slipActions: { flexDirection: 'row', gap: 10 },
  editBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  editText: { fontSize: 12.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.primary },
  verifyBtn: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
  },
  verifyText: { fontSize: 12.5, fontFamily: FONT.medium, fontWeight: '600', color: '#fff' },

  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    alignSelf: 'stretch',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: 20,
    gap: 8,
  },
  modalTitle: { fontSize: 18, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  modalSub: { fontSize: 13, color: COLORS.textMuted, fontFamily: FONT.regular, lineHeight: 18 },
  inputRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  inputWrap: { flex: 1, gap: 4 },
  inputLabel: {
    fontSize: 9.5,
    letterSpacing: 0.7,
    fontFamily: FONT.medium,
    fontWeight: '600',
    color: COLORS.textFaint,
  },
  modalInput: {
    height: 52,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.field,
    fontFamily: FONT.regular,
    borderWidth: 1,
    borderColor: COLORS.outline,
  },
  modalErr: { fontSize: 12, color: COLORS.danger, fontFamily: FONT.regular },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  modalCancel: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.chipIdle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: { color: COLORS.text, fontSize: 14, fontFamily: FONT.medium, fontWeight: '600' },
  modalSave: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveText: { color: '#fff', fontSize: 14, fontFamily: FONT.medium, fontWeight: '600' },
});