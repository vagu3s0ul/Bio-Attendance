/**
 * Web shim for services/settings.ts — localStorage instead of SecureStore so
 * the app can run in the browser (dev/preview). Same keys, same interface.
 */
import type { Role } from '@/types';
const BASE_URL_KEY = 'sps_base_url';
const COOKIE_KEY = 'sps_session_cookie';
const TOKEN_KEY = 'sps_api_token';
const USER_KEY = 'sps_user';
const USERNAME_KEY = 'sps_saved_username';

export const DEFAULT_BASE_URL =
  process.env.EXPO_PUBLIC_BASE_URL || 'http://attendance.spscsialkot.com';

export const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 12; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

let cachedBaseUrl: string | null = null;

function read(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, value);
  } catch {
    // non-fatal
  }
}

export async function getBaseUrl(): Promise<string> {
  if (cachedBaseUrl) return cachedBaseUrl;
  cachedBaseUrl = (read(BASE_URL_KEY) || DEFAULT_BASE_URL).replace(/\/+$/, '');
  return cachedBaseUrl;
}

export async function getToken(): Promise<string | null> {
  return read(TOKEN_KEY);
}

export async function setToken(token: string | null): Promise<void> {
  write(TOKEN_KEY, token);
}

export async function getCookie(): Promise<string | null> {
  return read(COOKIE_KEY);
}

export async function setCookie(cookie: string): Promise<void> {
  write(COOKIE_KEY, cookie);
}

export async function clearCookie(): Promise<void> {
  cachedBaseUrl = null;
  write(COOKIE_KEY, null);
}

export async function mergeCookie(
  setCookieHeader: string | string[] | undefined
): Promise<void> {
  if (!setCookieHeader) return;
  const existing = (await getCookie()) || '';
  const seen = new Map<string, string>();
  for (const pair of existing.split('; ')) {
    const idx = pair.indexOf('=');
    if (idx > 0) seen.set(pair.slice(0, idx), pair.slice(idx + 1));
  }
  const parts = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  for (const raw of parts) {
    for (const item of String(raw).split(/,(?=[A-Za-z_]+=)/)) {
      const first = item.split(';')[0].trim();
      const idx = first.indexOf('=');
      if (idx > 0) seen.set(first.slice(0, idx), first.slice(idx + 1));
    }
  }
  const merged = Array.from(seen.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
  if (merged) await setCookie(merged);
}

export async function getUser(): Promise<{ username: string; name: string; role: 'admin' | 'teacher' } | null> {
  try {
    const json = read(USER_KEY);
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

export async function setUser(
  user: { username: string; name: string; role: Role } | null
): Promise<void> {
  write(USER_KEY, user ? JSON.stringify(user) : null);
}

export async function getSavedUsername(): Promise<string | null> {
  return read(USERNAME_KEY);
}

export async function setSavedUsername(username: string | null): Promise<void> {
  write(USERNAME_KEY, username);
}

export function isWeb(): boolean {
  return true;
}
