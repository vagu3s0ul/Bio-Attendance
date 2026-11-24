/**
 * Daily Reckoner — one-page attendance summary for the Principal and
 * Section Heads (admin reaches it from Reports).
 *
 * The four blocks (Pre-School, Boys Block, Girls Block, College Section)
 * come from the server, scoped by role: a section head sees only their own
 * wing, the principal and admin see all four. Total = active students on
 * record; present/absent come from that day's attendance; unmarked =
 * students with no record that day (shown as a note, never counted as
 * absent). No Estate Officer signature, no maintenance column — as on the
 * paper form.
 *
 * On screen the blocks stack on a phone and sit 2x2 on a wide screen. The
 * printed / saved PDF version is always the 2x2 one-pager, exactly like
 * the paper form (summary table with the blank row, Remarks and Principal
 * signature lines included).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import Screen from '@/components/Screen';
import AppBar from '@/components/AppBar';
import Card from '@/components/Card';
import { COLORS, FONT, LABEL_CAPS, RADIUS, SPACING } from '@/constants/theme';
import { fetchReckoner, type ReckonerBlock, type ReckonerData } from '@/services/api';
import { useSession } from '@/store/session';
import { todayISO } from '@/services/domain';
import { SessionExpiredError } from '@/types';

const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function parseISODate(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
}

/** "2026-11-24" -> "Tuesday, 24 Nov 2026" (falls back to the raw value). */
function formatDateLong(iso: string): string {
  const p = parseISODate(iso);
  if (!p) return iso;
  const dt = new Date(p.y, p.m, p.d);
  return `${DAYS_FULL[dt.getDay()]}, ${pad2(p.d)} ${MONTHS_SHORT[p.m]} ${p.y}`;
}

function stepISO(iso: string, deltaDays: number): string {
  const p = parseISODate(iso);
  if (!p) return iso;
  const dt = new Date(p.y, p.m, p.d + deltaDays);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const SUMMARY_SHORT: Record<string, string> = {
  'pre-school': 'Pre-School',
  boys: 'Boys',
  girls: 'Girls',
  college: 'College',
};

/**
 * The printable one-pager: 2x2 block tables, the end summary exactly as on
 * the paper form (blank row under the header, then Grand Total / Total
 * Present / Total Absent / Attendance%), Remarks and Principal lines.
 */
function buildReckonerHtml(data: ReckonerData, dateLabel: string): string {
  const blockHtml = data.blocks
    .map((b) => {
      const rows = b.classes
        .map(
          (r, i) =>
            `<tr><td>${i + 1}</td><td>${esc(r.class)}</td><td>${esc(r.sec) || '—'}</td><td>${r.total}</td><td>${r.present}</td><td>${r.absent}</td><td class="rolls">${r.absent_rolls.length ? r.absent_rolls.join(', ') : '—'}</td></tr>`
        )
        .join('\n');
      return `<section class="block"><h2>${esc(b.title)}</h2><table>
<thead><tr><th>Sr#</th><th>Class</th><th>Sec</th><th>Total</th><th>Pre</th><th>Abs</th><th>Admission numbers of absentees</th></tr></thead>
<tbody>${rows}
<tr class="total"><td></td><td colspan="2">Total</td><td>${b.grand_total}</td><td>${b.total_present}</td><td>${b.total_absent}</td><td></td></tr>
</tbody></table>
<p class="sign">Signature Section Head: ______________________</p></section>`;
    })
    .join('\n');

  const sumRows: [string, (b: ReckonerBlock) => string][] = [
    ['Grand Total', (b) => String(b.grand_total)],
    ['Total Present', (b) => String(b.total_present)],
    ['Total Absent', (b) => String(b.total_absent)],
    ['Attendance %', (b) => `${b.attendance_pct}%`],
  ];
  const sumHead = data.blocks.map((b) => `<th>${esc(SUMMARY_SHORT[b.key] || b.title)}</th>`).join('');
  const sumBody = sumRows
    .map(
      ([label, fn]) =>
        `<tr><td>${label}</td>${data.blocks.map((b) => `<td>${fn(b)}</td>`).join('')}</tr>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>Daily Reckoner — ${esc(dateLabel)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #1a1a1a; background: #fff; padding: 14px 18px; }
  header { text-align: center; margin-bottom: 10px; }
  header h1 { font-size: 19px; letter-spacing: .4px; }
  header .sub { font-size: 14px; margin-top: 2px; }
  header .sub b { text-decoration: underline; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .block h2 { font-size: 13px; background: #C8102E; color: #fff; padding: 4px 8px; border-radius: 4px 4px 0 0; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #999; padding: 2px 5px; text-align: center; }
  th { background: #F3F4F6; font-weight: 600; }
  td.rolls { text-align: left; font-size: 10.5px; }
  tr.total td { font-weight: 700; background: #F3F4F6; }
  .sign { font-size: 11px; margin-top: 4px; }
  .end { margin-top: 12px; }
  .end h2 { font-size: 13px; margin-bottom: 4px; }
  table.summary td:first-child, table.summary th:first-child { text-align: left; font-weight: 600; }
  tr.blank td { height: 14px; }
  .remarks { font-size: 12px; margin-top: 10px; }
  .principal { font-size: 12px; margin-top: 14px; }
  footer { font-size: 11px; color: #555; margin-top: 12px; border-top: 1px solid #ddd; padding-top: 6px; line-height: 1.5; }
  @media print {
    @page { size: A4 landscape; margin: 10mm; }
    body { padding: 0; }
    .block h2 { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style></head><body>
<header><h1>Sialkot Public School &amp; College</h1><p class="sub"><b>DAILY RECKONER</b> &nbsp; Date: ${esc(dateLabel)}</p></header>
<div class="grid">
${blockHtml}
</div>
<div class="end"><h2>Summary</h2>
<table class="summary"><thead><tr><th></th>${sumHead}</tr></thead><tbody><tr class="blank"><td></td>${data.blocks.map(() => '<td></td>').join('')}</tr>
${sumBody}
</tbody></table>
</div>
<p class="remarks">Remarks if any: ________________________________________________________________________</p>
<p class="principal">Principal: ______________________</p>
<footer>Notes: Total = active students on record for the class. Present = Total − Absent for the day. Students with no record that day are not counted as absent.</footer>
</body></html>`;
}

export default function ReckonerScreen() {
  const router = useRouter();
  const { user } = useSession();
  const { width } = useWindowDimensions();
  const [date, setDate] = useState(todayISO());
  const [data, setData] = useState<ReckonerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);

  const canView =
    user?.role === 'admin' || user?.role === 'principal' || user?.role === 'section_head';
  const twoCol = width >= 700;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchReckoner(date));
    } catch (e: any) {
      if (e instanceof SessionExpiredError) {
        Alert.alert('Session expired', 'Please log in again.');
        router.replace('/(auth)/login');
        return;
      }
      setError(e?.message || "Couldn't load the reckoner.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [date, router]);

  useEffect(() => {
    if (canView) void load();
    else setLoading(false);
  }, [canView, load]);

  const onPrint = useCallback(async () => {
    if (!data || printing) return;
    setPrinting(true);
    const html = buildReckonerHtml(data, formatDateLong(data.date));
    try {
      await Print.printAsync({ html });
    } catch {
      // No print service (or print dismissed with an error): share the page
      // as an HTML file so it can be opened in a browser and printed or
      // saved as PDF from there.
      try {
        const uri = `${FileSystem.cacheDirectory}daily-reckoner-${data.date}.html`;
        await FileSystem.writeAsStringAsync(uri, html, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        await Sharing.shareAsync(uri, { mimeType: 'text/html' });
      } catch (e: any) {
        Alert.alert('Could not print', e?.message || 'Try again later.');
      }
    } finally {
      setPrinting(false);
    }
  }, [data, printing]);

  return (
    <Screen>
      <AppBar showBell={false} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Daily Reckoner</Text>
        {!canView ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              The Daily Reckoner is for the Principal and Section Heads.
            </Text>
          </Card>
        ) : (
          <>
            <View style={styles.dateRow}>
              <Pressable
                style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}
                onPress={() => setDate((d) => stepISO(d, -1))}
                accessibilityRole="button"
                accessibilityLabel="Previous day"
              >
                <Ionicons name="chevron-back-outline" size={18} color={COLORS.primary} />
              </Pressable>
              <Text style={styles.dateText}>{formatDateLong(date)}</Text>
              <Pressable
                style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}
                onPress={() => setDate((d) => stepISO(d, 1))}
                accessibilityRole="button"
                accessibilityLabel="Next day"
              >
                <Ionicons name="chevron-forward-outline" size={18} color={COLORS.primary} />
              </Pressable>
              {date !== todayISO() ? (
                <Pressable
                  style={({ pressed }) => [styles.todayBtn, pressed && styles.pressed]}
                  onPress={() => setDate(todayISO())}
                >
                  <Text style={styles.todayText}>Today</Text>
                </Pressable>
              ) : null}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.printBtn,
                pressed && styles.pressed,
                (!data || loading) && styles.printBtnDisabled,
              ]}
              onPress={onPrint}
              disabled={!data || loading || printing}
            >
              {printing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="print-outline" size={18} color="#fff" />
              )}
              <Text style={styles.printBtnText}>
                {printing ? 'Preparing…' : 'Print / Save as PDF'}
              </Text>
            </Pressable>

            {loading ? (
              <View style={styles.center}>
                <ActivityIndicator color={COLORS.primary} />
              </View>
            ) : error ? (
              <Card style={styles.emptyCard}>
                <Text style={styles.emptyText}>{error}</Text>
                <Pressable
                  style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
                  onPress={() => void load()}
                >
                  <Text style={styles.retryText}>Retry</Text>
                </Pressable>
              </Card>
            ) : data ? (
              <>
                <View style={styles.grid}>
                  {data.blocks.map((b) => (
                    <View key={b.key} style={[styles.blockWrap, twoCol && styles.blockHalf]}>
                      <BlockCard block={b} />
                    </View>
                  ))}
                </View>
                <SummaryCard blocks={data.blocks} />
                <Text style={styles.footNote}>
                  Printed copies include the Remarks line and Principal signature. Students with
                  no record that day are not counted as absent.
                </Text>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function BlockCard({ block }: { block: ReckonerBlock }) {
  return (
    <Card style={styles.blockCard}>
      <View style={styles.blockHead}>
        <Text style={styles.blockTitle}>{block.title}</Text>
        <Text style={styles.blockTotals}>
          {block.grand_total} total · {block.total_present} present · {block.total_absent} absent
        </Text>
      </View>
      <View style={styles.trHead}>
        <Text style={[styles.th, styles.cSr]}>#</Text>
        <Text style={[styles.th, styles.cClass]}>Class</Text>
        <Text style={[styles.th, styles.cSec]}>Sec</Text>
        <Text style={[styles.th, styles.cNum]}>Total</Text>
        <Text style={[styles.th, styles.cNum]}>Pre</Text>
        <Text style={[styles.th, styles.cNum]}>Abs</Text>
        <Text style={[styles.th, styles.cRolls]}>Absentees</Text>
      </View>
      {block.classes.map((r, i) => (
        <View key={`${r.class}-${r.sec}`} style={[styles.tr, i % 2 === 1 && styles.trAlt]}>
          <Text style={[styles.td, styles.cSr]}>{i + 1}</Text>
          <Text style={[styles.td, styles.cClass]}>{r.class}</Text>
          <Text style={[styles.td, styles.cSec]}>{r.sec || '—'}</Text>
          <Text style={[styles.td, styles.cNum]}>{r.total}</Text>
          <Text style={[styles.td, styles.cNum]}>{r.present}</Text>
          <Text style={[styles.td, styles.cNum, r.absent > 0 && styles.tdAbsent]}>{r.absent}</Text>
          <Text style={[styles.tdRolls, styles.cRolls]}>
            {r.absent_rolls.length ? r.absent_rolls.join(', ') : '—'}
          </Text>
        </View>
      ))}
      <View style={[styles.tr, styles.trTotal]}>
        <Text style={[styles.td, styles.cSr]} />
        <Text style={[styles.td, styles.cClass, styles.tdBold]}>Total</Text>
        <Text style={[styles.td, styles.cSec]} />
        <Text style={[styles.td, styles.cNum, styles.tdBold]}>{block.grand_total}</Text>
        <Text style={[styles.td, styles.cNum, styles.tdBold]}>{block.total_present}</Text>
        <Text style={[styles.td, styles.cNum, styles.tdBold]}>{block.total_absent}</Text>
        <Text style={[styles.tdRolls, styles.cRolls]} />
      </View>
      {block.unmarked > 0 ? (
        <Text style={styles.unmarkedNote}>
          {block.unmarked} student{block.unmarked === 1 ? '' : 's'} not marked yet
        </Text>
      ) : null}
    </Card>
  );
}

function SummaryCard({ blocks }: { blocks: ReckonerBlock[] }) {
  const rows: [string, (b: ReckonerBlock) => string][] = [
    ['Grand Total', (b) => String(b.grand_total)],
    ['Total Present', (b) => String(b.total_present)],
    ['Total Absent', (b) => String(b.total_absent)],
    ['Attendance %', (b) => `${b.attendance_pct}%`],
  ];
  return (
    <Card style={styles.blockCard}>
      <Text style={[styles.blockTitle, styles.summaryTitle]}>Summary</Text>
      <View style={styles.trHead}>
        <Text style={[styles.th, styles.sumLabel]} />
        {blocks.map((b) => (
          <Text key={b.key} style={[styles.th, styles.sumCell]}>
            {SUMMARY_SHORT[b.key] || b.title}
          </Text>
        ))}
      </View>
      {rows.map(([label, fn], i) => (
        <View key={label} style={[styles.tr, i % 2 === 1 && styles.trAlt]}>
          <Text style={[styles.td, styles.sumLabel, styles.tdBold]}>{label}</Text>
          {blocks.map((b) => (
            <Text key={b.key} style={[styles.td, styles.sumCell, styles.tdCenter]}>
              {fn(b)}
            </Text>
          ))}
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: SPACING.lg, paddingTop: 0, paddingBottom: 40, gap: SPACING.md },
  title: { fontSize: 20, fontFamily: FONT.display, fontWeight: '300', color: COLORS.text, marginBottom: 4 },
  center: { paddingVertical: 40, alignItems: 'center' },
  emptyCard: { padding: SPACING.xl, alignItems: 'center', gap: SPACING.md },
  emptyText: { color: COLORS.textMuted, fontFamily: FONT.regular, textAlign: 'center', lineHeight: 19 },
  retryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
  },
  retryText: { color: '#fff', fontSize: 13, fontFamily: FONT.regular },
  pressed: { opacity: 0.85 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateText: { flex: 1, fontSize: 14, fontFamily: FONT.regular, color: COLORS.text, textAlign: 'center' },
  todayBtn: {
    paddingHorizontal: 12,
    height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayText: { color: COLORS.primaryDeep, fontSize: 13, fontFamily: FONT.regular },
  printBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 46,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
  },
  printBtnDisabled: { opacity: 0.5 },
  printBtnText: { color: '#fff', fontSize: 14, fontFamily: FONT.regular },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md },
  blockWrap: { width: '100%' },
  blockHalf: { width: '48.5%', flexGrow: 1 },
  blockCard: { padding: 0, overflow: 'hidden' },
  blockHead: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.sm, gap: 2 },
  blockTitle: { fontSize: 14, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  summaryTitle: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md },
  blockTotals: { fontSize: 11.5, fontFamily: FONT.regular, color: COLORS.textMuted },
  trHead: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceLow,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.outline,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outline,
  },
  th: { fontSize: 10, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.textFaint, letterSpacing: 0.6 },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.outline,
  },
  trAlt: { backgroundColor: COLORS.surfaceLow },
  trTotal: { backgroundColor: COLORS.surfaceLow, borderBottomWidth: 0 },
  td: { fontSize: 11.5, fontFamily: FONT.regular, color: COLORS.text },
  tdBold: { fontWeight: '600', fontFamily: FONT.medium },
  tdAbsent: { color: COLORS.danger },
  tdRolls: { fontSize: 10.5, fontFamily: FONT.regular, color: COLORS.textMuted },
  tdCenter: { textAlign: 'center' },
  cSr: { width: 24, textAlign: 'center' },
  cClass: { flex: 1.1 },
  cSec: { width: 40, textAlign: 'center' },
  cNum: { width: 32, textAlign: 'center' },
  cRolls: { flex: 2.2 },
  sumLabel: { flex: 1.5 },
  sumCell: { flex: 1 },
  unmarkedNote: {
    fontSize: 11,
    fontFamily: FONT.regular,
    color: COLORS.warningText,
    backgroundColor: COLORS.warningBg,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  footNote: { fontSize: 11, color: COLORS.textMuted, fontFamily: FONT.regular, lineHeight: 16 },
});
