/**
 * Web shim for services/cookies.ts — the native cookie module doesn't exist
 * in the browser; the browser manages cookies itself.
 */
export function supportsNativeCookies(): boolean {
  return false;
}

export async function syncWebViewCookies(): Promise<boolean> {
  return false;
}

export async function clearWebViewCookies(): Promise<void> {
  // no-op on web
}
