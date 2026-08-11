/**
 * WebView cookie sync.
 *
 * The WebView pages (entry form, reports, audit, manage, export) must keep the
 * same PHP session. We seed the native cookie store with our PHPSESSID via
 * @react-native-cookies/cookies, then plain navigations/forms inside the
 * WebView carry the session automatically.
 *
 * NOTE: the cookie module is a native dependency — it only works in a dev
 * build (`npx expo run:android`) or a production build (EAS), NOT in Expo Go.
 * When seeding is unavailable we fall back to sending the Cookie header on the
 * initial page load (best effort).
 */
import CookieManager from '@react-native-cookies/cookies';
import { Platform } from 'react-native';
import { getBaseUrl, getCookie, isWeb } from './settings';

function hostOf(url: string): string {
  return (url.replace(/^https?:\/\//, '').split('/')[0] || '').split(':')[0];
}

export function supportsNativeCookies(): boolean {
  return (Platform.OS === 'android' || Platform.OS === 'ios') && !isWeb();
}

/** Seed the WebView cookie store with the current session cookie. */
export async function syncWebViewCookies(): Promise<boolean> {
  if (!supportsNativeCookies()) return false;
  try {
    const cookie = await getCookie();
    const base = await getBaseUrl();
    if (cookie) {
      const domain = hostOf(base);
      for (const pair of cookie.split('; ')) {
        const idx = pair.indexOf('=');
        if (idx <= 0) continue;
        await CookieManager.set(base, {
          name: pair.slice(0, idx),
          value: pair.slice(idx + 1),
          domain,
          path: '/',
          secure: base.startsWith('https'),
        });
      }
    }
    return true;
  } catch {
    return false;
  }
}

/** Remove all cookies for the site from the WebView cookie store. */
export async function clearWebViewCookies(): Promise<void> {
  if (!supportsNativeCookies()) return;
  try {
    await CookieManager.clearAll(true);
  } catch {
    // best effort
  }
}
