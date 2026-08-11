/**
 * On-device attendance FALLBACK persistence.
 *
 * The site now stores attendance in `daily_records.is_absent` (server is the
 * source of truth — entry.php renders a Status checkbox the app reads back
 * and posts). This local map is kept only as a fallback for pages that don't
 * expose the Status column yet, keyed by class + date.
 */
import * as SecureStore from 'expo-secure-store';

function keyOf(className: string): string {
  // SecureStore keys only allow [a-zA-Z0-9._-]; sanitize like other stores.
  return `att_absent_${className.trim().replace(/[^a-zA-Z0-9._-]/g, '')}`;
}

/** Rolls marked absent for (class, date). Empty when nothing stored. */
export async function getAbsentRolls(
  className: string,
  date: string
): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(keyOf(className));
    const map = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    const list = map[date];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Persist the absent roll list for (class, date). */
export async function setAbsentRolls(
  className: string,
  date: string,
  rolls: string[]
): Promise<void> {
  try {
    const raw = await SecureStore.getItemAsync(keyOf(className));
    const map = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    map[date] = rolls;
    await SecureStore.setItemAsync(keyOf(className), JSON.stringify(map));
  } catch {
    // non-fatal
  }
}
