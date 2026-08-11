/**
 * WhatsApp helpers for the "Notify parents" flow.
 *
 * The school's PHP site has no `whatsapp_number` column or form field today,
 * so numbers are stored ON-DEVICE (SecureStore), keyed by the stable
 * `class:roll` identity that both entry.php and manage.php agree on. Making
 * this server-side requires the SQL/PHP change noted in the README; the app
 * keeps working locally until then.
 */
import * as SecureStore from 'expo-secure-store';
import { Linking, Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Storage (per-class JSON maps — SecureStore values must stay < ~2KB)
// ---------------------------------------------------------------------------

function mapKey(className: string): string {
  // SecureStore keys only allow [a-zA-Z0-9._-]; class labels are like "7B"
  // but sanitize anyway so odd labels can never throw.
  return `wa_map_${className.trim().replace(/[^a-zA-Z0-9._-]/g, '')}`;
}

/** Load the { roll -> number } map for a class (rolls are strings). */
export async function getWhatsappMap(className: string): Promise<Record<string, string>> {
  try {
    const raw = await SecureStore.getItemAsync(mapKey(className));
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Get a single student's number ('' when not on file). */
export async function getWhatsappNumber(
  className: string,
  roll: string
): Promise<string> {
  const map = await getWhatsappMap(className);
  return map[roll] || '';
}

/** Upsert one student's number; returns the normalized value stored. */
export async function setWhatsappNumber(
  className: string,
  roll: string,
  number: string
): Promise<void> {
  const map = await getWhatsappMap(className);
  const normalized = normalizeNumber(number);
  if (normalized) map[roll] = normalized;
  else delete map[roll];
  try {
    await SecureStore.setItemAsync(mapKey(className), JSON.stringify(map));
  } catch {
    // non-fatal
  }
}

// ---------------------------------------------------------------------------
// Number normalization / validation
// ---------------------------------------------------------------------------

/**
 * Best-effort E.164-ish normalization: strip spaces/dashes/parens, then fix a
 * Pakistani national-format number to international (+92) when possible.
 * Returns '' for input that can't become a plausible phone number.
 */
export function normalizeNumber(raw: string): string {
  let digits = String(raw || '').replace(/[^\d+]/g, '');
  if (!digits) return '';
  if (digits.startsWith('+')) {
    digits = digits.replace(/\+/g, '');
    if (!/^\d{8,15}$/.test(digits)) return '';
    return '+' + digits;
  }
  if (digits.length === 10 && digits.startsWith('0')) {
    return '+92' + digits.slice(1); // 03XXXXXXXXX
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return '+92' + digits.slice(1); // 0 3XX XXXXXXX
  }
  if (digits.length === 12 && digits.startsWith('92')) {
    return '+' + digits;
  }
  if (digits.length === 13 && digits.startsWith('92')) {
    return '+' + digits;
  }
  if (/^\d{8,15}$/.test(digits)) return '+' + digits;
  return '';
}

export function isValidNumber(raw: string): boolean {
  return normalizeNumber(raw) !== '';
}

// ---------------------------------------------------------------------------
// Message building
// ---------------------------------------------------------------------------

/** Natural-language phrase for each checkpoint (5.3 template mapping). */
export const CHECKPOINT_PHRASES: Record<string, string> = {
  uniform: 'proper uniform',
  shoes: 'proper school shoes',
  socks: 'school socks',
  haircut: 'a proper haircut',
  nails: 'trimmed nails',
  bag: 'a school bag',
};

/** "shoes and haircut" / "uniform, socks, and a school bag" style join. */
export function joinFailedItems(items: string[]): string {
  const phrases = items
    .map((k) => CHECKPOINT_PHRASES[k] || k)
    .filter(Boolean);
  if (phrases.length <= 1) return phrases[0] || '';
  if (phrases.length === 2) return `${phrases[0]} and ${phrases[1]}`;
  return `${phrases.slice(0, -1).join(', ')}, and ${phrases[phrases.length - 1]}`;
}

export const SCHOOL_NAME = 'Sialkot Public School & College';

/**
 * Build the parent message for one student. `failedItems` are checkpoint keys
 * (uniform/shoes/…) — combined into ONE message per student (5.3).
 */
export function buildParentMessage(opts: {
  studentName: string;
  roll: string;
  className: string;
  failedItems: string[];
  date: string; // YYYY-MM-DD
  schoolName?: string;
}): string {
  const items = joinFailedItems(opts.failedItems);
  return (
    `Dear parent, your ward ${opts.studentName} (Roll ${opts.roll}, Class ${opts.className}) ` +
    `was found without ${items} today (${opts.date}). Kindly ensure this is corrected. — ` +
    `${opts.schoolName || SCHOOL_NAME}`
  );
}

/** Absence alert — sent when the student was marked Absent on the entry. */
export function buildAbsentMessage(opts: {
  studentName: string;
  roll: string;
  className: string;
  date: string; // YYYY-MM-DD
  schoolName?: string;
}): string {
  return (
    `Dear parent, your ward ${opts.studentName} (Roll ${opts.roll}, Class ${opts.className}) ` +
    `was absent today (${opts.date}). Please contact the school regarding their absence. — ` +
    `${opts.schoolName || SCHOOL_NAME}`
  );
}

// ---------------------------------------------------------------------------
// Deep links
// ---------------------------------------------------------------------------

/** Digits-only international number for wa.me (no '+'). */
export function waDigits(number: string): string {
  return number.replace(/\D/g, '');
}

/** https://wa.me/{number}?text={message} — works on both platforms. */
export function waLink(number: string, message: string): string {
  return `https://wa.me/${waDigits(number)}?text=${encodeURIComponent(message)}`;
}

/** Whether the WhatsApp app can be opened on this device. */
export async function isWhatsAppInstalled(): Promise<boolean> {
  try {
    // Android 11+ requires a <queries> entry for canOpenURL — added by
    // plugins/withWhatsApp.js. The https: form is also tried as a fallback.
    const scheme = await Linking.canOpenURL('whatsapp://send?phone=00000000000');
    if (scheme) return true;
    return Platform.OS !== 'android' || (await Linking.canOpenURL('https://wa.me/00000000000'));
  } catch {
    return false;
  }
}
