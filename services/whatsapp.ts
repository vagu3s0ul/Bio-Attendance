/**
 * WhatsApp helpers for the "Notify parents" flow.
 *
 * Numbers live on the SCHOOL SERVER (students.whatsapp) and are read back
 * through `reports/students`. The on-device map (SecureStore) is only a
 * cache + offline fallback: a number saved while the server can't be reached
 * is kept on-device, marked pending, and uploaded automatically once the
 * server answers again. The server is the source of truth — a number changed
 * by one teacher (or the office) is what every other teacher sees.
 */
import * as SecureStore from 'expo-secure-store';
import { Linking, Platform } from 'react-native';
import { apiGet, apiPost } from './http';
import { registerWaClass } from './backup';

// ---------------------------------------------------------------------------
// Storage (per-class JSON maps — SecureStore values must stay < ~2KB)
// ---------------------------------------------------------------------------

function mapKey(className: string): string {
  // SecureStore keys only allow [a-zA-Z0-9._-]; class labels are like "7B"
  // but sanitize anyway so odd labels can never throw.
  return `wa_map_${className.trim().replace(/[^a-zA-Z0-9._-]/g, '')}`;
}

function pendingKey(className: string): string {
  return `wa_pending_${className.trim().replace(/[^a-zA-Z0-9._-]/g, '')}`;
}

/** Rolls whose on-device number the server hasn't accepted yet. */
async function getPendingRolls(className: string): Promise<Set<string>> {
  try {
    const raw = await SecureStore.getItemAsync(pendingKey(className));
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

async function setPendingRolls(className: string, rolls: Set<string>): Promise<void> {
  try {
    await SecureStore.setItemAsync(pendingKey(className), JSON.stringify([...rolls]));
  } catch {
    // non-fatal
  }
}

/** Server route that saves one student's number (see api.php). */
const SET_WHATSAPP_ROUTE = 'students/set-whatsapp';

/** Upload one number to the server. Throws when the server can't save it. */
async function postWhatsappNumber(
  className: string,
  roll: string,
  normalized: string
): Promise<void> {
  await apiPost<{ ok?: boolean }>(SET_WHATSAPP_ROUTE, {
    class: className,
    roll,
    whatsapp: normalized,
  });
}

/** Classes whose pending local numbers are already being uploaded. */
const syncRunning = new Set<string>();

/**
 * Upload on-device numbers the server doesn't have yet (saved while offline,
 * or before this release). Runs in the background; never throws. Only uploads
 * where the server field is empty — it never overwrites a number the office
 * already has on file.
 */
async function syncPendingLocal(
  className: string,
  server: Record<string, string>,
  local: Record<string, string>
): Promise<void> {
  if (syncRunning.has(className)) return;
  syncRunning.add(className);
  try {
    const pending = await getPendingRolls(className);
    const rolls = Object.keys(local).filter((roll) => local[roll] && !server[roll]);
    for (const roll of rolls) {
      try {
        await postWhatsappNumber(className, roll, local[roll]);
        pending.delete(roll);
      } catch {
        pending.add(roll);
      }
    }
    await setPendingRolls(className, pending);
  } finally {
    syncRunning.delete(className);
  }
}

/**
 * Load the { roll -> number } map for a class (rolls are strings).
 * The server's student records are the source of truth; on-device numbers
 * fill gaps, and numbers saved while offline (pending) override the server
 * until they upload. Falls back to the local map when the server is
 * unreachable.
 */
export async function getWhatsappMap(className: string): Promise<Record<string, string>> {
  const server: Record<string, string> = {};
  try {
    const list = await apiGet<Array<{ roll: string; whatsapp?: string }>>(
      'reports/students',
      { class: className }
    );
    for (const s of list) {
      const n = normalizeNumber(s.whatsapp || '');
      if (n) server[s.roll] = n;
    }
  } catch {
    // offline or older server — fall back to the local map
  }

  let local: Record<string, string> = {};
  try {
    const raw = await SecureStore.getItemAsync(mapKey(className));
    local = raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    local = {};
  }

  // Upload anything saved on-device that the server doesn't have yet.
  void syncPendingLocal(className, server, local);

  const pending = await getPendingRolls(className);
  const pendingMap: Record<string, string> = {};
  for (const roll of pending) {
    if (local[roll]) pendingMap[roll] = local[roll];
  }
  return { ...local, ...server, ...pendingMap };
}

/** Get a single student's number ('' when not on file). */
export async function getWhatsappNumber(
  className: string,
  roll: string
): Promise<string> {
  const map = await getWhatsappMap(className);
  return map[roll] || '';
}

/**
 * Upsert one student's number. Saves to the school server first so every
 * teacher and the office see it; keeps the on-device copy as a cache and as
 * an offline fallback. Returns whether the server accepted it — when false,
 * the number is saved on this device only and marked pending for automatic
 * upload later. Never throws.
 */
export async function setWhatsappNumber(
  className: string,
  roll: string,
  number: string
): Promise<{ savedToServer: boolean }> {
  const normalized = normalizeNumber(number);
  let savedToServer = false;
  try {
    await postWhatsappNumber(className, roll, normalized);
    savedToServer = true;
  } catch {
    savedToServer = false;
  }

  try {
    const raw = await SecureStore.getItemAsync(mapKey(className));
    const map: Record<string, string> = raw ? JSON.parse(raw) : {};
    if (normalized) map[roll] = normalized;
    else delete map[roll];
    await SecureStore.setItemAsync(mapKey(className), JSON.stringify(map));
    const pending = await getPendingRolls(className);
    if (savedToServer || !normalized) pending.delete(roll);
    else pending.add(roll);
    await setPendingRolls(className, pending);
    await registerWaClass(className);
  } catch {
    // non-fatal: the server save (if it worked) is what matters
  }
  return { savedToServer };
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
    `ٱلسَّلَامُ عَلَيْكُمْ Dear parent, your ward ${opts.studentName} (Roll ${opts.roll}, Class ${opts.className}) ` +
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
    `ٱلسَّلَامُ عَلَيْكُمْ Dear parent, your ward ${opts.studentName} (Roll ${opts.roll}, Class ${opts.className}) ` +
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
