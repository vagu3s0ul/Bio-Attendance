/**
 * Fee dues and defaulter lists, backed by api.php.
 *
 *   GET  fee/dues        -> every active student of a class for one month
 *   POST fee/save        -> admin only: upsert (or clear) monthly dues
 *   GET  fee/defaulters  -> students whose balance is still positive
 *   GET  reports/defaulters -> uniform / absence defaulters over a date range
 *
 * Dues are one row per student per month on the server; a row that is all
 * zeroes is deleted, so "no dues this month" never shows up as a defaulter.
 */
import { ApiError, apiGet, apiPost } from './http';
import * as FileSystem from 'expo-file-system';
import { toByteArray } from 'base64-js';
import { parseXlsxSpreadsheet } from './xlsx';
import { SessionExpiredError } from '@/types';
import type { CheckpointKey } from './domain';

async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) throw new SessionExpiredError();
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Global student search (name or roll)
// ---------------------------------------------------------------------------

export interface StudentSearchHit {
  class: string;
  roll: string;
  name: string;
}

/** Search every active student across all classes by name or roll number. */
export function searchStudents(q: string): Promise<StudentSearchHit[]> {
  return call(() => apiGet<StudentSearchHit[]>('students/search', { q }));
}

// ---------------------------------------------------------------------------
// Fee dues
// ---------------------------------------------------------------------------

export interface FeeRow {
  roll: string;
  name: string;
  /** Amount billed for the month. */
  amount: number;
  /** Amount received so far. */
  paid: number;
  /** amount - paid (negative when overpaid). */
  balance: number;
  note: string;
}

export interface FeeTotals {
  due: number;
  paid: number;
  balance: number;
}

export interface FeeDues {
  className: string;
  /** YYYY-MM */
  month: string;
  /** Months that already have dues for this class, newest first. */
  months: string[];
  /** Only an administrator may change dues. */
  canEdit: boolean;
  rows: FeeRow[];
  totals: FeeTotals;
}

export interface FeeDefaulters {
  className: string;
  month: string;
  rows: FeeRow[];
  totals: FeeTotals & { defaulters: number };
}

export function fetchFeeDues(q: { className?: string; month?: string }): Promise<FeeDues> {
  return call(() => apiGet<FeeDues>('fee/dues', { class: q.className, month: q.month }));
}

export function fetchFeeDefaulters(q: {
  className?: string;
  month?: string;
}): Promise<FeeDefaulters> {
  return call(() => apiGet<FeeDefaulters>('fee/defaulters', { class: q.className, month: q.month }));
}

export interface FeeSaveResult {
  ok: boolean;
  message: string;
  saved: number;
  cleared: number;
}

/** One row of a dues spreadsheet/CSV: roll number plus optional amounts. */
export interface CsvEntry {
  roll: string;
  amount?: number;
  paid?: number;
  note?: string;
}

export function saveFeeDues(q: {
  className: string;
  month: string;
  rows: { roll: string; amount: number; paid: number; note?: string }[];
}): Promise<FeeSaveResult> {
  return call(() =>
    apiPost<FeeSaveResult>('fee/save', {
      class: q.className,
      month: q.month,
      rows: q.rows,
    })
  );
}

// ---------------------------------------------------------------------------
// Spreadsheet (XLS/XLSX/CSV) imports and slip verification
// ---------------------------------------------------------------------------

const XLS_MIME_TYPES = [
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.spreadsheet', // .ods also handled by SheetJS
  'text/csv',
  'text/comma-separated-values',
  'text/plain',
  'application/octet-stream',
];

/** MIME types the dues upload button accepts (Android may report generic). */
export function feesFileTypes(): string[] {
  return [...XLS_MIME_TYPES];
}

/** CSV text -> roll -> values (matches by header or bare roll,amount,paid). */
export function mapFeeCsv(text: string): Map<string, CsvEntry> {
  return parseFeeRows(text);
}

/**
 * Read a picked dues file: binary .xls/.xlsx goes through SheetJS, everything
 * else is treated as CSV text. Returns roll -> values.
 */
export async function parseFeeFile(file: {
  name: string;
  uri: string;
}): Promise<Map<string, CsvEntry>> {
  const name = (file.name || '').toLowerCase();
  const binary = /\.(xlsx|xls|xlsm|ods)$/.test(name);

  if (binary) {
    const base64 = await FileSystem.readAsStringAsync(file.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const entries = parseXlsxSpreadsheet(toByteArray(base64));
    const map = new Map<string, CsvEntry>();
    for (const entry of entries) map.set(entry.roll, entry);
    if (map.size > 0) return map;
    // Office files saved as CSV under an .xls name: fall back to text.
  }

  const text = await FileSystem.readAsStringAsync(file.uri);
  return mapFeeCsv(text);
}

/**
 * Mark one student's monthly dues as fully paid (slip verified). Balance goes
 * to zero, so the student drops out of every defaulter view school-wide —
 * teachers, heads and the principal all read the same server rows.
 */
export function markFeePaid(q: {
  className: string;
  month: string;
  roll: string;
  amount: number;
}): Promise<FeeSaveResult> {
  return saveFeeDues({
    className: q.className,
    month: q.month,
    rows: [{ roll: q.roll, amount: q.amount, paid: q.amount }],
  });
}

export interface ApplyDuesResult {
  /** Number of students matched by roll number and saved. */
  applied: number;
  /** Rows whose roll number matched nobody. */
  skipped: number;
  total: number;
}

/**
 * Apply a parsed dues file campus-wide: each roll number is looked up across
 * all classes (so the accountant does not need to know which class a student
 * is in) and the pending fee is written to that student's monthly dues.
 */
export async function applyDuesFile(
  entries: Map<string, CsvEntry>,
  month: string,
  onProgress?: (done: number, total: number) => void
): Promise<ApplyDuesResult> {
  const total = entries.size;
  let done = 0;
  let applied = 0;
  let skipped = 0;

  for (const [roll, entry] of entries) {
    try {
      if (entry.amount === undefined) {
        skipped++;
        continue;
      }
      const hits = await searchStudents(roll);
      const exact = hits.filter((h) => h.roll === roll);
      if (exact.length === 0) {
        skipped++;
      } else {
        for (const hit of exact) {
          await saveFeeDues({
            className: hit.class,
            month,
            rows: [{ roll, amount: entry.amount, paid: entry.paid || 0 }],
          });
        }
        applied += exact.length;
      }
    } finally {
      done++;
      onProgress?.(done, total);
    }
  }

  return { applied, skipped, total };
}

/**
 * Split a CSV/dues text into {roll, amount, paid, note} rows. Handles a header
 * row in any column order, or bare `roll,amount,paid[,note]` lines.
 */
export function parseFeeRows(text: string): Map<string, CsvEntry> {
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
  const amountIdx = hasHeader ? first.findIndex((c) => c === 'amount' || c === 'due' || c === 'fee' || c === 'pending') : 1;
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
      roll,
      amount: num(amountIdx),
      paid: num(paidIdx),
      note: noteIdx >= 0 && noteIdx < cells.length ? cells[noteIdx] : undefined,
    };
    if (entry.amount === undefined && entry.paid === undefined) continue;
    out.set(roll, entry);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Uniform / absence defaulters
// ---------------------------------------------------------------------------

export type DefaulterType = 'uniform' | 'absent';

export interface DefaulterRow {
  roll: string;
  name: string;
  /** Days in the range this student was flagged. */
  days: number;
  /** How many days each checkpoint failed (uniform rows only). */
  failures: Partial<Record<CheckpointKey, number>>;
}

export interface DefaulterReport {
  className: string;
  type: DefaulterType;
  /** YYYY-MM-DD */
  from: string;
  to: string;
  /** Days the class actually had attendance in the range. */
  days: number;
  rows: DefaulterRow[];
  perCheckpoint?: Partial<Record<CheckpointKey, number>>;
  /** Set when the database cannot store absences. */
  note?: string;
}

export function fetchDefaulters(q: {
  type: DefaulterType;
  className?: string;
  from: string;
  to: string;
}): Promise<DefaulterReport> {
  return call(() =>
    apiGet<DefaulterReport>('reports/defaulters', {
      type: q.type,
      class: q.className,
      from: q.from,
      to: q.to,
    })
  );
}

// ---------------------------------------------------------------------------
// Formatting helpers used by the fee screens
// ---------------------------------------------------------------------------

/** "Rs. 5,000" — the app never shows cents unless there are some. */
export function money(value: number): string {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  const whole = Math.round(rounded) === rounded;
  const text = (whole ? Math.round(rounded) : rounded).toLocaleString('en-PK', {
    maximumFractionDigits: 2,
    minimumFractionDigits: whole ? 0 : 2,
  });
  return `Rs. ${text}`;
}

/** "2026-10" -> "October 2026" (falls back to the raw value). */
export function monthLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month || '');
  if (!m) return month || '';
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const idx = Number(m[2]) - 1;
  if (idx < 0 || idx > 11) return month;
  return `${names[idx]} ${m[1]}`;
}

/** Current month as YYYY-MM. */
export function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** The n most recent months (0 = current), newest first. */
export function recentMonths(count = 4): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/** YYYY-MM-DD for a Date. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

/** ISO date `days` before today. */
export function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return isoDate(d);
}

/** First day of the current month. */
export function monthStart(): string {
  const d = new Date();
  return isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
}
