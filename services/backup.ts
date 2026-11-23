/**
 * Backup & restore of the on-device data that would otherwise be lost on a
 * reinstall (WhatsApp numbers, base URL override, remembered username,
 * attendance fallback rolls).
 *
 * Face embeddings and all attendance records live on the server and are
 * re-fetched after login, so they are not part of this backup.
 */
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';

const WA_CLASSES_KEY = 'sps_wa_classes';
const ATT_CLASSES_KEY = 'sps_att_classes';
const BASE_URL_KEY = 'sps_base_url';
const USERNAME_KEY = 'sps_saved_username';

function safeKey(s: string): string {
  return s.trim().replace(/[^a-zA-Z0-9._-]/g, '');
}

function waMapKey(className: string): string {
  return `wa_map_${safeKey(className)}`;
}

function attMapKey(className: string): string {
  return `att_absent_${safeKey(className)}`;
}

async function readRegistry(key: string): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function writeRegistry(key: string, classes: string[]): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, JSON.stringify(Array.from(new Set(classes))));
  } catch {
    // non-fatal
  }
}

/** Register a class as having on-device data (called by storage modules). */
export async function registerWaClass(className: string): Promise<void> {
  const list = await readRegistry(WA_CLASSES_KEY);
  if (!list.includes(className)) {
    list.push(className);
    await writeRegistry(WA_CLASSES_KEY, list);
  }
}

export async function registerAttClass(className: string): Promise<void> {
  const list = await readRegistry(ATT_CLASSES_KEY);
  if (!list.includes(className)) {
    list.push(className);
    await writeRegistry(ATT_CLASSES_KEY, list);
  }
}

export interface BackupPayload {
  version: number;
  createdAt: string;
  baseUrl?: string | null;
  savedUsername?: string | null;
  whatsapp: Record<string, Record<string, string>>;
  attendance: Record<string, Record<string, string[]>>;
}

/** Build a backup payload from current on-device data. */
export async function buildBackup(): Promise<BackupPayload> {
  const payload: BackupPayload = {
    version: 1,
    createdAt: new Date().toISOString(),
    whatsapp: {},
    attendance: {},
  };

  try {
    payload.baseUrl = await SecureStore.getItemAsync(BASE_URL_KEY);
  } catch {
    payload.baseUrl = null;
  }
  try {
    payload.savedUsername = await SecureStore.getItemAsync(USERNAME_KEY);
  } catch {
    payload.savedUsername = null;
  }

  const waClasses = await readRegistry(WA_CLASSES_KEY);
  for (const c of waClasses) {
    try {
      const raw = await SecureStore.getItemAsync(waMapKey(c));
      payload.whatsapp[c] = raw ? JSON.parse(raw) : {};
    } catch {
      payload.whatsapp[c] = {};
    }
  }

  const attClasses = await readRegistry(ATT_CLASSES_KEY);
  for (const c of attClasses) {
    try {
      const raw = await SecureStore.getItemAsync(attMapKey(c));
      payload.attendance[c] = raw ? JSON.parse(raw) : {};
    } catch {
      payload.attendance[c] = {};
    }
  }

  return payload;
}

/** Restore on-device data from a backup payload. */
export async function restoreBackup(payload: BackupPayload): Promise<void> {
  if (payload.baseUrl) {
    try {
      await SecureStore.setItemAsync(BASE_URL_KEY, payload.baseUrl);
    } catch {
      // non-fatal
    }
  }
  if (payload.savedUsername) {
    try {
      await SecureStore.setItemAsync(USERNAME_KEY, payload.savedUsername);
    } catch {
      // non-fatal
    }
  }

  const waClasses: string[] = [];
  for (const [c, map] of Object.entries(payload.whatsapp || {})) {
    try {
      await SecureStore.setItemAsync(waMapKey(c), JSON.stringify(map || {}));
      waClasses.push(c);
    } catch {
      // non-fatal
    }
  }
  if (waClasses.length) await writeRegistry(WA_CLASSES_KEY, waClasses);

  const attClasses: string[] = [];
  for (const [c, map] of Object.entries(payload.attendance || {})) {
    try {
      await SecureStore.setItemAsync(attMapKey(c), JSON.stringify(map || {}));
      attClasses.push(c);
    } catch {
      // non-fatal
    }
  }
  if (attClasses.length) await writeRegistry(ATT_CLASSES_KEY, attClasses);
}

/** Export backup to a JSON file in the cache dir; returns its URI. */
export async function exportBackupFile(): Promise<string> {
  const payload = await buildBackup();
  const uri = `${FileSystem.cacheDirectory}bio-attendance-backup.json`;
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(payload, null, 2));
  return uri;
}

/** Import backup from a file URI. */
export async function importBackupFile(uri: string): Promise<void> {
  const text = await FileSystem.readAsStringAsync(uri);
  const payload = JSON.parse(text) as BackupPayload;
  await restoreBackup(payload);
}
