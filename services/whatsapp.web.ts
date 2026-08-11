/**
 * Web shim for services/whatsapp.ts — in-memory number storage (no
 * SecureStore) so the Notify flow works in the browser preview. Numbers are
 * lost on reload; the native app persists them properly.
 */
import { Linking, Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Storage (in-memory on web)
// ---------------------------------------------------------------------------

const webMaps: Record<string, Record<string, string>> = {};

function mapKey(className: string): string {
  return `wa_map_${className.trim().replace(/[^a-zA-Z0-9._-]/g, '')}`;
}

export async function getWhatsappMap(className: string): Promise<Record<string, string>> {
  return { ...(webMaps[mapKey(className)] || {}) };
}

export async function getWhatsappNumber(
  className: string,
  roll: string
): Promise<string> {
  const map = await getWhatsappMap(className);
  return map[roll] || '';
}

export async function setWhatsappNumber(
  className: string,
  roll: string,
  number: string
): Promise<void> {
  const map = (webMaps[mapKey(className)] = webMaps[mapKey(className)] || {});
  const normalized = normalizeNumber(number);
  if (normalized) map[roll] = normalized;
  else delete map[roll];
}

// ---------------------------------------------------------------------------
// Number normalization / validation (same logic as the native module)
// ---------------------------------------------------------------------------

export function normalizeNumber(raw: string): string {
  let digits = String(raw || '').replace(/[^\d+]/g, '');
  if (!digits) return '';
  if (digits.startsWith('+')) {
    digits = digits.replace(/\+/g, '');
    if (!/^\d{8,15}$/.test(digits)) return '';
    return '+' + digits;
  }
  if (digits.length === 10 && digits.startsWith('0')) {
    return '+92' + digits.slice(1);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return '+92' + digits.slice(1);
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
// Message building / deep links (identical to native)
// ---------------------------------------------------------------------------

export const CHECKPOINT_PHRASES: Record<string, string> = {
  uniform: 'proper uniform',
  shoes: 'proper school shoes',
  socks: 'school socks',
  haircut: 'a proper haircut',
  nails: 'trimmed nails',
  bag: 'a school bag',
};

export function joinFailedItems(items: string[]): string {
  const phrases = items.map((k) => CHECKPOINT_PHRASES[k] || k).filter(Boolean);
  if (phrases.length <= 1) return phrases[0] || '';
  if (phrases.length === 2) return `${phrases[0]} and ${phrases[1]}`;
  return `${phrases.slice(0, -1).join(', ')}, and ${phrases[phrases.length - 1]}`;
}

export const SCHOOL_NAME = 'Sialkot Public School & College';

export function buildParentMessage(opts: {
  studentName: string;
  roll: string;
  className: string;
  failedItems: string[];
  date: string;
  schoolName?: string;
}): string {
  const items = joinFailedItems(opts.failedItems);
  return (
    `Dear parent, your ward ${opts.studentName} (Roll ${opts.roll}, Class ${opts.className}) ` +
    `was found without ${items} today (${opts.date}). Kindly ensure this is corrected. — ` +
    `${opts.schoolName || SCHOOL_NAME}`
  );
}

export function buildAbsentMessage(opts: {
  studentName: string;
  roll: string;
  className: string;
  date: string;
  schoolName?: string;
}): string {
  return (
    `Dear parent, your ward ${opts.studentName} (Roll ${opts.roll}, Class ${opts.className}) ` +
    `was absent today (${opts.date}). Please contact the school regarding their absence. — ` +
    `${opts.schoolName || SCHOOL_NAME}`
  );
}

export function waDigits(number: string): string {
  return number.replace(/\D/g, '');
}

export function waLink(number: string, message: string): string {
  return `https://wa.me/${waDigits(number)}?text=${encodeURIComponent(message)}`;
}

export async function isWhatsAppInstalled(): Promise<boolean> {
  try {
    if (await Linking.canOpenURL('whatsapp://send?phone=00000000000')) return true;
    return Platform.OS !== 'android' || (await Linking.canOpenURL('https://wa.me/00000000000'));
  } catch {
    return false;
  }
}
