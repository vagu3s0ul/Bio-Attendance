/**
 * Notify Parents — the screen shown right after saving a Daily Entry that had
 * at least one non-compliant student.
 *
 * WhatsApp deep links can't auto-send (platform constraint, spec 5.2): each
 * chat opens with the message pre-filled and the teacher taps Send inside
 * WhatsApp. This screen removes the back-and-forth friction by stepping
 * through selected students sequentially, advancing whenever the app resumes
 * from the background (AppState 'active').
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Screen from '@/components/Screen';
import Card from '@/components/Card';
import WhatsAppNumberModal from '@/components/WhatsAppNumberModal';
import { COLORS, FONT, LABEL_CAPS, RADIUS, SPACING } from '@/constants/theme';
import {
  buildAbsentMessage,
  buildParentMessage,
  getWhatsappMap,
  isWhatsAppInstalled,
  waLink,
} from '@/services/whatsapp';

interface Candidate {
  roll: string;
  name: string;
  failed: string[]; // checkpoint keys
}

interface AbsentCandidate {
  roll: string;
  name: string;
}

type RowKind = 'checklist' | 'absent';

interface Row extends Candidate {
  kind: RowKind;
  number: string;
  message: string;
  sendable: boolean;
  sent: boolean;
}

export default function NotifyScreen() {
  const params = useLocalSearchParams<{
    date?: string;
    className?: string;
    students?: string;
    absent?: string;
  }>();
  const router = useRouter();
  const date = params.date || '';
  const className = params.className || '';
  const candidates: Candidate[] = useMemo(() => {
    try {
      return JSON.parse(params.students || '[]') as Candidate[];
    } catch {
      return [];
    }
  }, [params.students]);
  const absentCandidates: AbsentCandidate[] = useMemo(() => {
    try {
      return JSON.parse(params.absent || '[]') as AbsentCandidate[];
    } catch {
      return [];
    }
  }, [params.absent]);

  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [waInstalled, setWaInstalled] = useState<boolean | null>(null);
  const [queue, setQueue] = useState<{ index: number; total: number } | null>(null);
  const [waModal, setWaModal] = useState<{ roll: string; name: string } | null>(null);
  /** Ordered row indices of the send queue; -1 = not sending. */
  const queueOrderRef = useRef<number[]>([]);
  const queuePosRef = useRef(-1);
  /** One-shot resume subscription used by individual sends (cleaned up on unmount). */
  const sendSubRef = useRef<{ remove: () => void } | null>(null);

  // Load numbers once the params arrive.
  useEffect(() => {
    let active = true;
    (async () => {
      const map = await getWhatsappMap(className);
      if (!active) return;
      const all: (Candidate & { kind: RowKind })[] = [
        ...candidates.map((c) => ({ ...c, kind: 'checklist' as const })),
        ...absentCandidates.map((c) => ({ ...c, failed: [], kind: 'absent' as const })),
      ];
      const built: Row[] = all.map((c) => {
        const number = (map[c.roll] || '').trim();
        return {
          ...c,
          number,
          message:
            c.kind === 'absent'
              ? buildAbsentMessage({ studentName: c.name, roll: c.roll, className, date })
              : buildParentMessage({
                  studentName: c.name,
                  roll: c.roll,
                  className,
                  failedItems: c.failed,
                  date,
                }),
          sendable: number !== '',
          sent: false,
        };
      });
      setRows(built);
      setSelected(new Set(built.filter((r) => r.sendable).map((r) => r.roll)));
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [className, JSON.stringify(candidates), JSON.stringify(absentCandidates), date]);

  useEffect(() => {
    isWhatsAppInstalled().then(setWaInstalled);
  }, []);

  const openChat = useCallback(async (row: Row) => {
    const link = waLink(row.number, row.message);
    try {
      await Linking.openURL(link);
    } catch {
      queuePosRef.current = -1;
      queueOrderRef.current = [];
      setQueue(null);
      Alert.alert('WhatsApp', 'Could not open WhatsApp for ' + row.name);
    }
  }, []);

  const advanceQueue = useCallback(() => {
    if (queuePosRef.current < 0) return;
    const doneIdx = queueOrderRef.current[queuePosRef.current];
    setRows((prev) => prev.map((r, i) => (i === doneIdx ? { ...r, sent: true } : r)));
    const nextPos = queuePosRef.current + 1;
    if (nextPos >= queueOrderRef.current.length) {
      queuePosRef.current = -1;
      queueOrderRef.current = [];
      setQueue(null);
      return;
    }
    const nextIdx = queueOrderRef.current[nextPos];
    queuePosRef.current = nextPos;
    setQueue({ index: nextPos, total: queueOrderRef.current.length });
    openChat(rows[nextIdx]);
  }, [rows, openChat]);

  // Sequential queue: whenever the app returns to foreground after a send,
  // mark the current one sent and open the next. Depends on `advanceQueue`
  // (recreated when `rows` change) so it never reads a stale rows closure.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      // Only advance on return-to-active while a queue is running.
      if (state === 'active' && queuePosRef.current >= 0) advanceQueue();
    });
    return () => sub.remove();
  }, [advanceQueue]);

  // Clean up any pending one-shot send subscription on unmount.
  useEffect(() => {
    return () => {
      if (sendSubRef.current) sendSubRef.current.remove();
    };
  }, []);

  const sendOne = useCallback((row: Row) => {
    openChat(row)
      .catch(() => {
        // openChat already alerts on failure; just don't leave a pending sub.
        if (sendSubRef.current) sendSubRef.current.remove();
        sendSubRef.current = null;
      })
      .then(() => {
        // Individual send: mark sent when the app resumes. Replaced on each
        // tap so a double-tap can't leak listeners.
        if (sendSubRef.current) sendSubRef.current.remove();
        const sub = AppState.addEventListener('change', (state) => {
          if (state === 'active') {
            setRows((prev) => prev.map((r) => (r.roll === row.roll ? { ...r, sent: true } : r)));
            if (sendSubRef.current) sendSubRef.current.remove();
            sendSubRef.current = null;
          }
        });
        sendSubRef.current = sub;
      });
  }, [openChat]);

  const sendSelected = useCallback(() => {
    const order = rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => selected.has(r.roll) && r.sendable);
    if (order.length === 0) return;
    queueOrderRef.current = order.map((o) => o.i);
    queuePosRef.current = 0;
    setQueue({ index: 0, total: order.length });
    openChat(order[0].r);
  }, [rows, selected, openChat]);

  const toggleSelect = (roll: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(roll)) next.delete(roll);
      else next.add(roll);
      return next;
    });
  };

  const selectAll = () => {
    setSelected((prev) => {
      const sendable = rows.filter((r) => r.sendable).map((r) => r.roll);
      const allSelected = sendable.every((r) => prev.has(r));
      const next = new Set(prev);
      if (allSelected) sendable.forEach((r) => next.delete(r));
      else sendable.forEach((r) => next.add(r));
      return next;
    });
  };

  const sendableRows = rows.filter((r) => r.sendable);
  const greyedRows = rows.filter((r) => !r.sendable);
  const allSelected = sendableRows.length > 0 && sendableRows.every((r) => selected.has(r.roll));
  const selectedSendable = sendableRows.filter((r) => selected.has(r.roll));

  const editingNumber = waModal
    ? { className, roll: waModal.roll, name: waModal.name }
    : null;

  if (rows.length === 0) {
    return (
      <Screen edges={[]}>
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Nothing to notify</Text>
          <Text style={styles.centerBody}>
            No non-compliant or absent students were found in this save.
          </Text>
          <Pressable style={styles.doneBtn} onPress={() => router.back()}>
            <Text style={styles.doneBtnText}>Back</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={[]}>
      <View style={styles.headerBar}>
        <Text style={[styles.headerTitle, LABEL_CAPS]}>Notify Parents</Text>
        <Text style={styles.headerSub}>
          {date || ''} · Class {className || '—'} · {sendableRows.length} with number
        </Text>
      </View>

      {waInstalled === false ? (
        <View style={styles.noWa}>
          <Ionicons name="logo-whatsapp" size={18} color={COLORS.warningText} />
          <Text style={styles.noWaText}>
            WhatsApp isn't installed on this device, so messages can't be sent. You can still
            review the list and add numbers.
          </Text>
        </View>
      ) : null}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
        {/* Select all */}
        {sendableRows.length > 0 ? (
          <Pressable style={styles.selectAll} onPress={selectAll}>
            <View style={allSelected ? [styles.check, styles.checkOn] : styles.check}>
              {allSelected ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
            </View>
            <Text style={styles.selectAllText}>
              Select all ({sendableRows.length})
            </Text>
          </Pressable>
        ) : null}

        {sendableRows.map((row) => (
          <Card key={row.roll} style={row.sent ? [styles.rowCard, styles.rowSent] : styles.rowCard}>
            <Pressable
              style={styles.rowMain}
              onPress={() => toggleSelect(row.roll)}
              disabled={queue !== null}
            >
              <View style={selected.has(row.roll) ? [styles.check, styles.checkOn] : styles.check}>
                {selected.has(row.roll) ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
              </View>
              <View style={styles.rowBody}>
                <View style={styles.rowNameLine}>
                  <Text style={styles.rowName} numberOfLines={1}>{row.name}</Text>
                  <Text style={styles.rowRoll}>Roll {row.roll}</Text>
                </View>
                <View style={styles.tags}>
                  {row.kind === 'absent' ? (
                    <View style={[styles.tag, styles.tagAbsent]}>
                      <Ionicons name="close-circle" size={11} color={COLORS.danger} />
                      <Text style={styles.tagAbsentText}>Absent</Text>
                    </View>
                  ) : (
                    row.failed.map((k) => (
                      <View key={k} style={styles.tag}>
                        <Text style={styles.tagText}>{label(k)}</Text>
                      </View>
                    ))
                  )}
                </View>
              </View>
              {row.sent ? (
                <View style={styles.sentBadge}>
                  <Ionicons name="checkmark-circle" size={15} color={COLORS.compliant} />
                  <Text style={styles.sentText}>Sent</Text>
                </View>
              ) : (
                <Pressable
                  style={styles.sendBtn}
                  onPress={() => sendOne(row)}
                  disabled={waInstalled === false || queue !== null}
                  hitSlop={6}
                >
                  <Ionicons name="logo-whatsapp" size={15} color={COLORS.compliant} />
                  <Text style={styles.sendBtnText}>Send</Text>
                </Pressable>
              )}
            </Pressable>
          </Card>
        ))}

        {/* Greyed: no number on file */}
        {greyedRows.length > 0 ? (
          <>
            <Text style={[styles.greyTitle, LABEL_CAPS]}>No WhatsApp number on file</Text>
            {greyedRows.map((row) => (
              <Card key={row.roll} style={styles.greyCard}>
                <View style={styles.rowMain}>
                  <View style={[styles.check, styles.checkDisabled]} />
                  <View style={styles.rowBody}>
                    <View style={styles.rowNameLine}>
                      <Text style={[styles.rowName, styles.greyText]} numberOfLines={1}>{row.name}</Text>
                      <Text style={[styles.rowRoll, styles.greyText]}>Roll {row.roll}</Text>
                    </View>
                    <View style={styles.tags}>
                      {row.kind === 'absent' ? (
                        <View style={[styles.tag, styles.tagAbsent]}>
                          <Ionicons name="close-circle" size={11} color={COLORS.danger} />
                          <Text style={styles.tagAbsentText}>Absent</Text>
                        </View>
                      ) : (
                        row.failed.map((k) => (
                          <View key={k} style={[styles.tag, styles.tagGrey]}>
                            <Text style={[styles.tagText, styles.greyText]}>{label(k)}</Text>
                          </View>
                        ))
                      )}
                    </View>
                  </View>
                  <Pressable
                    style={styles.addNumBtn}
                    onPress={() => setWaModal({ roll: row.roll, name: row.name })}
                  >
                    <Ionicons name="add" size={15} color={COLORS.primary} />
                    <Text style={styles.addNumText}>Add number</Text>
                  </Pressable>
                </View>
              </Card>
            ))}
          </>
        ) : null}
      </ScrollView>

      {/* Bottom action bar */}
      {sendableRows.length > 0 ? (
        <View style={styles.bottomBar}>
          {queue ? (
            <View style={styles.queueRow}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.queueText}>
                Sending {queue.index + 1} of {queue.total} — tap Send in WhatsApp, then come back
              </Text>
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.batchBtn,
                selectedSendable.length === 0 || waInstalled === false ? styles.batchBtnDisabled : null,
                pressed ? styles.pressed : null,
              ]}
              onPress={sendSelected}
              disabled={selectedSendable.length === 0 || waInstalled === false}
            >
              <Ionicons name="logo-whatsapp" size={18} color="#fff" />
              <Text style={styles.batchBtnText}>
                Send to selected ({selectedSendable.length})
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}

      {editingNumber ? (
        <WhatsAppNumberModal
          visible
          className={editingNumber.className}
          roll={editingNumber.roll}
          studentName={editingNumber.name}
          onClose={() => setWaModal(null)}
          onSaved={(number) => {
            setRows((prev) =>
              prev.map((r) =>
                r.roll === editingNumber.roll
                  ? { ...r, number, sendable: true }
                  : r
              )
            );
            setSelected((prev) => {
              const next = new Set(prev);
              next.add(editingNumber.roll);
              return next;
            });
            setWaModal(null);
          }}
        />
      ) : null}
    </Screen>
  );
}

function label(key: string): string {
  const map: Record<string, string> = {
    uniform: 'Uniform',
    shoes: 'Shoes',
    socks: 'Socks',
    haircut: 'Haircut',
    nails: 'Nails',
    bag: 'Bag',
  };
  return map[key] || key;
}

const styles = StyleSheet.create({
  headerBar: { padding: SPACING.lg, paddingBottom: SPACING.sm },
  headerTitle: { color: COLORS.textMuted },
  headerSub: { fontSize: 13, color: COLORS.textMuted, marginTop: 2, fontFamily: FONT.regular },
  noWa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.warningBg,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    borderRadius: RADIUS.md,
    padding: 10,
  },
  noWaText: { flex: 1, fontSize: 12, color: COLORS.warningText, fontFamily: FONT.regular, lineHeight: 17 },
  scroll: { flex: 1 },
  list: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 90 },
  selectAll: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  check: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: COLORS.primary },
  checkDisabled: { borderColor: COLORS.outline, backgroundColor: COLORS.surfaceHigh },
  selectAllText: { fontSize: 13, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.primary },
  rowCard: { padding: 12 },
  rowSent: { opacity: 0.65 },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowBody: { flex: 1 },
  rowNameLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowName: { fontSize: 15, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text, flexShrink: 1 },
  rowRoll: { fontSize: 11.5, color: COLORS.textMuted, fontFamily: FONT.regular },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  tag: {
    backgroundColor: COLORS.dangerSoft,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagGrey: { backgroundColor: COLORS.surfaceLow },
  tagText: { fontSize: 10.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.danger },
  tagAbsent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tagAbsentText: { fontSize: 10.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.danger },
  sentBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sentText: { fontSize: 11.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.compliant },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.compliant,
    backgroundColor: COLORS.surface,
  },
  sendBtnText: { fontSize: 12, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.compliant },
  greyCard: { padding: 12, backgroundColor: COLORS.surfaceLow },
  greyTitle: { color: COLORS.textFaint, marginTop: 6 },
  greyText: { color: COLORS.textFaint },
  addNumBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surface,
  },
  addNumText: { fontSize: 11.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.primary },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.outline,
    padding: SPACING.lg,
  },
  queueRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46 },
  queueText: { flex: 1, fontSize: 12.5, color: COLORS.textMuted, fontFamily: FONT.regular, lineHeight: 18 },
  batchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 46,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.compliant,
  },
  batchBtnDisabled: { opacity: 0.4 },
  batchBtnText: { color: '#fff', fontSize: 14, fontFamily: FONT.medium, fontWeight: '600' },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  centerTitle: { fontSize: 17, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  centerBody: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', fontFamily: FONT.regular, lineHeight: 19 },
  doneBtn: {
    marginTop: 10,
    minHeight: 42,
    paddingHorizontal: 22,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: { color: '#fff', fontSize: 14, fontFamily: FONT.medium, fontWeight: '600' },
});
