/**
 * Settings: base URL + persisted session pieces (API token / cookie / user).
 *
 * Native API calls authenticate with the bearer token issued by api.php; the
 * PHPSESSID cookie the login response also sets is kept (SecureStore) and
 * seeds the WebView's cookie store so embedded pages (forms, links) share the
 * same session.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { Role } from '@/types';

const BASE_URL_KEY = 'sps_base_url';
const COOKIE_KEY = 'sps_session_cookie';
const TOKEN_KEY = 'sps_api_token';
const USER_KEY = 'sps_user';

export const DEFAULT_BASE_URL =
  process.env.EXPO_PUBLIC_BASE_URL || 'http://140.245.1.42';

export const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 12; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

let cachedBaseUrl: string | null = null;

export async function getBaseUrl(): Promise<string> {
  if (cachedBaseUrl) return cachedBaseUrl;
  try {
    const override = await SecureStore.getItemAsync(BASE_URL_KEY);
    cachedBaseUrl = (override || DEFAULT_BASE_URL).replace(/\/+$/, '');
  } catch {
    cachedBaseUrl = DEFAULT_BASE_URL.replace(/\/+$/, '');
  }
  return cachedBaseUrl;
}

// --- API token ------------------------------------------------------------

export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string | null): Promise<void> {
  try {
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // non-fatal
  }
}

// --- Session cookie (WebView pages) ---------------------------------------

export async function getCookie(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(COOKIE_KEY);
  } catch {
    return null;
  }
}

export async function setCookie(cookie: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(COOKIE_KEY, cookie);
  } catch {
    // non-fatal
  }
}

export async function clearCookie(): Promise<void> {
  cachedBaseUrl = null;
  try {
    await SecureStore.deleteItemAsync(COOKIE_KEY);
  } catch {
    // non-fatal
  }
}

/** Merge new Set-Cookie pairs into the stored cookie, newest wins. */
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

// --- User -----------------------------------------------------------------

export async function getUser(): Promise<{ username: string; name: string; role: 'admin' | 'teacher' } | null> {
  try {
    const json = await SecureStore.getItemAsync(USER_KEY);
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

export async function setUser(
  user: { username: string; name: string; role: Role } | null
): Promise<void> {
  try {
    if (user) await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    else await SecureStore.deleteItemAsync(USER_KEY);
  } catch {
    // non-fatal
  }
}

// --- Remembered username (login convenience) ------------------------------

const USERNAME_KEY = 'sps_saved_username';

export async function getSavedUsername(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(USERNAME_KEY);
  } catch {
    return null;
  }
}

export async function setSavedUsername(username: string | null): Promise<void> {
  try {
    if (username) await SecureStore.setItemAsync(USERNAME_KEY, username);
    else await SecureStore.deleteItemAsync(USERNAME_KEY);
  } catch {
    // non-fatal
  }
}

export function isWeb(): boolean {
  return Platform.OS === 'web';
}
