/**
 * In-app update system.
 *
 * The app is distributed outside Google Play (sideloaded APKs), so updates are
 * delivered from the school site instead. The site hosts a small JSON file at
 *   <base>/app-update.json
 * with the shape:
 *   {
 *     "version": "1.4.1",
 *     "versionCode": 7,
 *     "apkUrl": "http://140.245.1.42/downloads/bio-attendance.apk",
 *     "notes": "What changed",
 *     "force": false
 *   }
 *
 * The app checks this on startup (and on demand from Settings) and, when a
 * newer build is available, downloads the APK in-app and launches the system
 * installer without opening a browser.
 *
 * DOWNLOAD ENGINE: the APK is downloaded with Android's system
 * DownloadManager (native ApkDownload module) whenever it is available.
 * DownloadManager is a system service, so the download keeps going with the
 * screen locked, the app backgrounded, or even the app killed, and shows a
 * system notification with progress. If the native module is missing (e.g.
 * an older build), it falls back to the old expo-file-system resumable
 * download, which only runs while the app is in the foreground.
 *
 * A download started with DownloadManager survives the app being killed:
 * its id is saved in SecureStore, so the next update check can resume it
 * (see getPendingDownload / resumePendingDownload) instead of starting over.
 * The apkUrl itself may point anywhere — the Oracle server, or a GitHub
 * Release asset — the manifest only carries the link.
 */
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import * as IntentLauncher from 'expo-intent-launcher';
import * as base64js from 'base64-js';
import { getBaseUrl } from './settings';

export interface UpdateInfo {
  version: string;
  versionCode: number;
  apkUrl: string;
  notes?: string;
  force?: boolean;
  /** Optional SHA-256 (hex) of the APK for integrity verification. */
  sha256?: string;
}

export interface InstalledInfo {
  version: string;
  versionCode: number;
}

/** Read the version of the currently installed build. */
export function installedInfo(): InstalledInfo {
  const version = Application.nativeApplicationVersion || Constants.expoConfig?.version || '1.4.22';
  const codeRaw = Application.nativeBuildVersion;
  const versionCode = codeRaw ? Number(codeRaw) : (Constants.expoConfig?.android?.versionCode ?? 28);
  return { version, versionCode: Number.isFinite(versionCode) ? versionCode : 28 };
}

/** Fetch the latest update manifest from the site. Returns null on failure. */
export async function fetchUpdateInfo(): Promise<UpdateInfo | null> {
  if (Platform.OS === 'web') return null;
  try {
    const base = await getBaseUrl();
    const url = `${base}/app-update.json`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || !json.apkUrl) return null;
    const sha256 = json.sha256 || json.apkSha256 || json.sha256sum;
    return {
      version: String(json.version || ''),
      versionCode: Number(json.versionCode || 0),
      apkUrl: String(json.apkUrl),
      notes: json.notes ? String(json.notes) : undefined,
      force: !!json.force,
      sha256: sha256 ? String(sha256).toLowerCase() : undefined,
    };
  } catch {
    return null;
  }
}

/** True when the remote build is newer than what is installed. */
export function isUpdateAvailable(info: UpdateInfo, installed: InstalledInfo): boolean {
  if (info.versionCode && installed.versionCode) {
    return info.versionCode > installed.versionCode;
  }
  return compareVersions(info.version, installed.version) > 0;
}

function compareVersions(a: string, b: string): number {
  const pa = String(a).split('.').map((n) => Number(n) || 0);
  const pb = String(b).split('.').map((n) => Number(n) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

export interface DownloadProgress {
  /** 0..1 progress, or null when the server does not report a content length. */
  fraction: number | null;
  /** Bytes written so far. */
  writtenBytes: number;
  /** Expected total size, or 0 when unknown. */
  totalBytes: number;
}

/** File name used for the downloaded APK, in both download engines. */
const APK_FILE_NAME = 'bio-attendance-update.apk';
/** SecureStore key for a DownloadManager download that outlived the app. */
const PENDING_KEY = 'sps_pending_download';

interface ApkDownloadStatus {
  status: 'pending' | 'running' | 'paused' | 'successful' | 'failed' | 'unknown';
  bytesDownloaded: number;
  bytesTotal: number;
  reason: number;
  localUri?: string;
  filePath?: string;
}

interface ApkDownloadModuleType {
  enqueue(url: string, fileName: string, title: string, description: string): Promise<number>;
  query(downloadId: number, fileName: string): Promise<ApkDownloadStatus | null>;
  remove(downloadId: number): Promise<number>;
}

interface PendingDownload {
  downloadId: number;
  versionCode: number;
  apkUrl: string;
}

/** The native DownloadManager module, or null on builds without it. */
function getApkDownloadModule(): ApkDownloadModuleType | null {
  const mod = (NativeModules as any).ApkDownload;
  return mod && typeof mod.enqueue === 'function' ? (mod as ApkDownloadModuleType) : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function savePendingDownload(pending: PendingDownload): Promise<void> {
  try {
    await SecureStore.setItemAsync(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // Non-fatal: without the record the download still finishes in the
    // system, it just cannot be resumed after an app restart.
  }
}

async function clearPendingDownload(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PENDING_KEY);
  } catch {
    // ignore
  }
}

/** A background download that outlived the app, if one was recorded. */
export async function getPendingDownload(): Promise<PendingDownload | null> {
  try {
    const raw = await SecureStore.getItemAsync(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingDownload;
    if (!parsed || typeof parsed.downloadId !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Poll a DownloadManager download until it finishes. Resolves with the
 * downloaded file's local URI on success; throws on failure or when the
 * system no longer knows the download id.
 */
async function waitForDownloadManager(
  dm: ApkDownloadModuleType,
  downloadId: number,
  onProgress?: (progress: DownloadProgress) => void
): Promise<string> {
  for (;;) {
    const status = await dm.query(downloadId, APK_FILE_NAME);
    if (!status) {
      throw new Error('Download was removed by the system. Please try again.');
    }
    if (status.status === 'successful') {
      return status.localUri || (status.filePath ? `file://${status.filePath}` : '');
    }
    if (status.status === 'failed') {
      throw new Error(`Download failed (system error ${status.reason}). Please try again.`);
    }
    if (onProgress) {
      const total = status.bytesTotal > 0 ? status.bytesTotal : 0;
      onProgress({
        fraction: total > 0 ? Math.min(1, status.bytesDownloaded / total) : null,
        writtenBytes: status.bytesDownloaded,
        totalBytes: total,
      });
    }
    await sleep(1000);
  }
}

/**
 * Verify the downloaded APK against the manifest SHA-256 (when provided)
 * and hand it to the system installer. `uri` must be a file the app can
 * read (normally inside the cache dir). Throws on verification failure.
 */
async function verifyAndInstall(uri: string, info: UpdateInfo): Promise<void> {
  // Integrity check: verify the downloaded APK matches the published SHA-256
  // (when the manifest provides one) before handing it to the installer.
  // The file is hashed in chunks, so a 40+ MB APK never has to be held in a
  // single JS string (which is what used to make this step fail).
  if (info.sha256) {
    let actual: string;
    try {
      actual = (await sha256OfFile(uri)).toLowerCase();
    } catch (e: any) {
      throw new Error(`Could not verify the downloaded APK (${e?.message || 'read error'}).`);
    }
    if (actual !== info.sha256.toLowerCase()) {
      try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
      throw new Error('Downloaded APK failed the integrity check (hash mismatch).');
    }
  }
  await launchInstaller(uri);
}

/** Hand the downloaded APK to the system package installer. */
async function launchInstaller(uri: string): Promise<void> {
  const contentUri = await FileSystem.getContentUriAsync(uri);
  // A custom native module takes precedence when a build provides one.
  const installer = (NativeModules as any).ApkInstaller;
  if (installer) {
    await installer.installApk(contentUri);
    return;
  }
  // Otherwise open the package installer with a normal VIEW intent. The
  // content:// URI comes from expo-file-system's own FileProvider, and flag 1
  // is FLAG_GRANT_READ_URI_PERMISSION so the installer can read it.
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    type: 'application/vnd.android.package-archive',
    flags: 1,
  });
}

/**
 * Download the APK in-app and launch the system package installer.
 * Throws on download/install failure so the caller can show an error.
 * The download runs in the background (system DownloadManager) when
 * available, so the user may leave the screen or lock the phone.
 */
export async function downloadAndInstallUpdate(
  info: UpdateInfo,
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  if (Platform.OS === 'web') throw new Error('Updates are only available on Android.');

  const dm = getApkDownloadModule();
  if (dm) {
    await downloadViaManager(dm, info, onProgress);
    return;
  }
  await downloadViaFileSystem(info, onProgress);
}

/** DownloadManager path: survives backgrounding, screen lock, app kill. */
async function downloadViaManager(
  dm: ApkDownloadModuleType,
  info: UpdateInfo,
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  const id = await dm.enqueue(
    info.apkUrl,
    APK_FILE_NAME,
    'Bio Attendance update',
    `Version ${info.version} is downloading`
  );
  await savePendingDownload({ downloadId: id, versionCode: info.versionCode, apkUrl: info.apkUrl });
  try {
    await finishManagerDownload(dm, id, info, onProgress);
  } catch (e) {
    await clearPendingDownload();
    try { await dm.remove(id); } catch {}
    throw e;
  }
}

/**
 * Wait for a DownloadManager download to finish, then copy the APK into
 * the cache dir, verify it and open the installer.
 */
async function finishManagerDownload(
  dm: ApkDownloadModuleType,
  downloadId: number,
  info: UpdateInfo,
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  const localUri = await waitForDownloadManager(dm, downloadId, onProgress);
  if (!localUri) throw new Error('Download finished but the file is missing. Please try again.');
  await clearPendingDownload();
  const target = `${FileSystem.cacheDirectory}${APK_FILE_NAME}`;
  try {
    await FileSystem.deleteAsync(target, { idempotent: true });
  } catch {
    // ignore
  }
  await FileSystem.copyAsync({ from: localUri, to: target });
  if (onProgress) {
    onProgress({ fraction: 1, writtenBytes: 0, totalBytes: 0 });
  }
  await verifyAndInstall(target, info);
}

/**
 * Resume a background download recorded earlier (e.g. the app was closed
 * or killed mid-download). Returns 'resumed' when the download was picked
 * up and installed, 'none' when there is nothing to resume for this
 * version — the caller should then start a fresh download.
 */
export async function resumePendingDownload(
  info: UpdateInfo,
  onProgress?: (progress: DownloadProgress) => void
): Promise<'resumed' | 'none'> {
  const pending = await getPendingDownload();
  if (!pending || pending.versionCode !== info.versionCode) return 'none';
  const dm = getApkDownloadModule();
  if (!dm) return 'none';
  let status: ApkDownloadStatus | null;
  try {
    status = await dm.query(pending.downloadId, APK_FILE_NAME);
  } catch {
    return 'none';
  }
  if (!status || status.status === 'failed') {
    await clearPendingDownload();
    try { await dm.remove(pending.downloadId); } catch {}
    return 'none';
  }
  try {
    await finishManagerDownload(dm, pending.downloadId, info, onProgress);
  } catch (e) {
    await clearPendingDownload();
    try { await dm.remove(pending.downloadId); } catch {}
    throw e;
  }
  return 'resumed';
}

/** Old in-process path, kept as a fallback for builds without ApkDownload. */
async function downloadViaFileSystem(
  info: UpdateInfo,
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  const target = `${FileSystem.cacheDirectory}${APK_FILE_NAME}`;
  // Remove any stale file from a previous attempt.
  try {
    await FileSystem.deleteAsync(target, { idempotent: true });
  } catch {
    // ignore
  }

  const download = FileSystem.createDownloadResumable(
    info.apkUrl,
    target,
    {},
    (progress) => {
      if (!onProgress) return;
      const total = progress.totalBytesExpectedToWrite;
      onProgress({
        fraction: total > 0 ? progress.totalBytesWritten / total : null,
        writtenBytes: progress.totalBytesWritten,
        totalBytes: total > 0 ? total : 0,
      });
    }
  );
  const result = await download.downloadAsync();
  if (!result || result.status !== 200) {
    throw new Error(`Download failed (status ${result?.status ?? 'unknown'}).`);
  }

  await verifyAndInstall(result.uri, info);
}

function base64ToBytes(b64: string): Uint8Array {
  return base64js.toByteArray(b64);
}

/**
 * Streaming SHA-256 (pure JS, no native/crypto dependency).
 *
 * The downloader used to read the whole APK into one Base64 string to hash it,
 * which fails for a 40+ MB package; feeding the digest 4 MB at a time keeps
 * memory flat regardless of APK size.
 */
const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

class Sha256Hasher {
  private h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  private pending = new Uint8Array(64);
  private pendingLen = 0;
  private total = 0;

  update(bytes: Uint8Array): void {
    this.total += bytes.length;
    let off = 0;
    if (this.pendingLen > 0) {
      const take = Math.min(64 - this.pendingLen, bytes.length);
      this.pending.set(bytes.subarray(0, take), this.pendingLen);
      this.pendingLen += take;
      off = take;
      if (this.pendingLen === 64) {
        this.compress(this.pending, 0);
        this.pendingLen = 0;
      }
    }
    while (off + 64 <= bytes.length) {
      this.compress(bytes, off);
      off += 64;
    }
    if (off < bytes.length) {
      this.pending.set(bytes.subarray(off), 0);
      this.pendingLen = bytes.length - off;
    }
  }

  hex(): string {
    const rem = this.total % 64;
    const tail = new Uint8Array((rem < 56 ? 1 : 2) * 64);
    tail.set(this.pending.subarray(0, rem));
    tail[rem] = 0x80;
    const view = new DataView(tail.buffer);
    const bits = this.total * 8;
    view.setUint32(tail.length - 8, Math.floor(bits / 0x100000000), false);
    view.setUint32(tail.length - 4, bits >>> 0, false);
    for (let o = 0; o < tail.length; o += 64) this.compress(tail, o);
    return this.h.map((n) => n.toString(16).padStart(8, '0')).join('');
  }

  private compress(bytes: Uint8Array, start: number): void {
    const view = new DataView(bytes.buffer, bytes.byteOffset + start, 64);
    const w = new Array<number>(64);
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(i * 4, false);
    const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = this.h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    this.h[0] = (this.h[0] + a) >>> 0;
    this.h[1] = (this.h[1] + b) >>> 0;
    this.h[2] = (this.h[2] + c) >>> 0;
    this.h[3] = (this.h[3] + d) >>> 0;
    this.h[4] = (this.h[4] + e) >>> 0;
    this.h[5] = (this.h[5] + f) >>> 0;
    this.h[6] = (this.h[6] + g) >>> 0;
    this.h[7] = (this.h[7] + hh) >>> 0;
  }
}

/** Size of each read when hashing a file, in bytes. */
const HASH_CHUNK_BYTES = 4 * 1024 * 1024;

/** SHA-256 (hex) of a file on disk, read in chunks. */
async function sha256OfFile(uri: string): Promise<string> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error('downloaded file is missing');
  const size = info.size ?? 0;
  if (size <= 0) throw new Error('downloaded file is empty');
  const hasher = new Sha256Hasher();
  for (let pos = 0; pos < size; pos += HASH_CHUNK_BYTES) {
    const length = Math.min(HASH_CHUNK_BYTES, size - pos);
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      position: pos,
      length,
    });
    hasher.update(base64ToBytes(base64));
  }
  return hasher.hex();
}
