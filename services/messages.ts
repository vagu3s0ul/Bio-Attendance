/**
 * WhatsApp message templates for the defaulter lists (fees, uniform, absence).
 *
 * Native and web both use these, so they live apart from services/whatsapp.ts
 * (whose storage layer is platform-specific).
 */
import { CHECKPOINT_PHRASES, SCHOOL_NAME, joinFailedItems } from './whatsapp';

/** Long human date: "29 Oct 2026" from "2026-10-29". */
function prettyDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return iso;
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${m[3]} ${months[Number(m[2]) - 1] || m[2]} ${m[1]}`;
}

/** "1 Oct 2026 to 29 Oct 2026" (single day collapses to one date). */
export function prettyRange(from: string, to: string): string {
  return from === to ? prettyDate(from) : `${prettyDate(from)} to ${prettyDate(to)}`;
}

/** "October 2026" from "2026-10". */
export function prettyMonth(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month || '');
  if (!m) return month;
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${names[Number(m[2]) - 1] || m[2]} ${m[1]}`;
}

/** Plain number without the currency prefix, for message bodies. */
function amount(value: number): string {
  const n = Math.round((Number(value) || 0) * 100) / 100;
  return n.toLocaleString('en-PK', { maximumFractionDigits: 2 });
}

/** Fee reminder for one student: the balance still owed for the month. */
export function buildFeeMessage(opts: {
  studentName: string;
  roll: string;
  className: string;
  month: string; // YYYY-MM
  balance: number;
  paid?: number;
  total?: number;
  note?: string;
  schoolName?: string;
}): string {
  const total = opts.total ?? 0;
  const paid = opts.paid ?? 0;
  let body =
    `Dear parent, the school fee for ${prettyMonth(opts.month)} of your ward ` +
    `${opts.studentName} (Roll ${opts.roll}, Class ${opts.className}) is pending. `;

  if (total > 0) {
    body += `Total Rs. ${amount(total)}, received Rs. ${amount(paid)}, balance Rs. ${amount(opts.balance)}. `;
  } else {
    body += `Outstanding balance: Rs. ${amount(opts.balance)}. `;
  }

  if (opts.note && opts.note.trim()) body += `(${opts.note.trim()}) `;
  body += `Kindly clear the dues at your earliest. — ${opts.schoolName || SCHOOL_NAME}`;
  return body;
}

/**
 * Uniform reminder for one student over a date range, e.g.
 * "...was found without proper uniform on 3 day(s) between 1 Oct and 29 Oct".
 */
export function buildUniformDefaulterMessage(opts: {
  studentName: string;
  roll: string;
  className: string;
  from: string;
  to: string;
  failedItems: string[]; // checkpoint keys
  days: number;
  schoolName?: string;
}): string {
  const items = joinFailedItems(opts.failedItems) || 'the required uniform';
  const days = opts.days > 0 ? `${opts.days} day(s) ` : '';
  return (
    `Dear parent, your ward ${opts.studentName} (Roll ${opts.roll}, Class ${opts.className}) ` +
    `was found without ${items} on ${days}between ${prettyRange(opts.from, opts.to)}. ` +
    `Kindly ensure this is corrected. — ${opts.schoolName || SCHOOL_NAME}`
  );
}

/** Absence reminder over a date range. */
export function buildAbsentRangeMessage(opts: {
  studentName: string;
  roll: string;
  className: string;
  from: string;
  to: string;
  days: number;
  schoolName?: string;
}): string {
  const days = opts.days > 0 ? `${opts.days} day(s) ` : '';
  return (
    `Dear parent, your ward ${opts.studentName} (Roll ${opts.roll}, Class ${opts.className}) ` +
    `was marked absent on ${days}between ${prettyRange(opts.from, opts.to)}. ` +
    `Please contact the school regarding these absences. — ${opts.schoolName || SCHOOL_NAME}`
  );
}

/** Human label for a checkpoint key, matching the WhatsApp phrasing. */
export function checkpointLabel(key: string): string {
  const label = CHECKPOINT_PHRASES[key] || key;
  return label.charAt(0).toUpperCase() + label.slice(1);
}
