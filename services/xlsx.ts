/**
 * Binary Excel (.xls/.xlsx) parsing via SheetJS. Kept in its own module so the
 * web build can stub it out (`xlsx.web.ts`) — SheetJS pulls in Node built-ins
 * that break expo's webpack bundler.
 */
import * as XLSX from 'xlsx';
import type { CsvEntry } from './fees';

function cellNum(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const raw = value.replace(/[^0-9.\-]/g, '');
    if (raw === '') return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function cellText(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

/** Parse the first worksheet of a binary Excel file into fee rows. */
export function parseXlsxSpreadsheet(bytes: Uint8Array): CsvEntry[] {
  const wb = XLSX.read(bytes, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];

  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const out: CsvEntry[] = [];

  for (const raw of rows) {
    const cells: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      cells[key.trim().toLowerCase().replace(/\s+/g, '_')] = value;
    }

    const roll = cellText(
      cells.roll ?? cells.rollno ?? cells.roll_no ?? cells.rollnumber ?? cells.roll_number
    );
    if (!roll) continue;

    const amount = cellNum(cells.amount ?? cells.due ?? cells.fee ?? cells.pending ?? cells.pending_fee);
    const paid = cellNum(cells.paid ?? cells.received);
    const note = cellText(cells.note ?? cells.remarks);

    const entry: CsvEntry = {
      roll,
      ...(amount !== undefined ? { amount } : {}),
      ...(paid !== undefined ? { paid } : {}),
      ...(note !== undefined ? { note } : {}),
    };
    if (entry.amount === undefined && entry.paid === undefined) continue;
    out.push(entry);
  }
  return out;
}