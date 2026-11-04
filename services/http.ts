/**
 * JSON client for the site's API (api.php).
 *
 * Authentication is a bearer token issued by `auth/login`, kept in SecureStore
 * by services/settings.ts. The PHP session cookie the login response also sets
 * is captured here and replayed, so the WebView pages (export, legacy links)
 * keep the same session instead of the server minting a new one per request.
 */
import axios from 'axios';
import { getBaseUrl, getCookie, getToken, mergeCookie } from './settings';

/** A non-2xx response from api.php, with its real HTTP status. */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export type QueryValue = string | number | null | undefined;

export interface RequestOptions {
  method?: 'GET' | 'POST';
  query?: Record<string, QueryValue>;
  /** JSON body (ignored when `form` is given). */
  body?: unknown;
  /** Multipart body, used only by the CSV upload. */
  form?: FormData;
  /** Send the stored bearer token (default true). */
  auth?: boolean;
  timeout?: number;
}

function buildUrl(base: string, route: string, query?: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  params.set('r', route);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === null || value === undefined || value === '') continue;
    params.set(key, String(value));
  }
  return `${base}/api.php?${params.toString()}`;
}

/** Turn any transport failure into a message a teacher can act on. */
function networkError(base: string): Error {
  return new Error(
    `Cannot reach the server (${base}). Check your connection and the server URL in Settings.`
  );
}

/** Flip a URL's scheme (https↔http): the fallback used when one transport fails. */
function alternateBase(base: string): string {
  if (/^http:\/\//i.test(base)) return base.replace(/^http:\/\//i, 'https://');
  if (/^https:\/\//i.test(base)) return base.replace(/^https:\/\//i, 'http://');
  return base;
}

export async function apiRequest<T>(route: string, opts: RequestOptions = {}): Promise<T> {
  const primary = await getBaseUrl();
  const candidates = [primary, alternateBase(primary)];
  const token = opts.auth === false ? null : await getToken();
  const cookie = await getCookie();

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  // Replay the PHP session so the server keeps that session (and the WebView
  // pages using it) instead of opening a fresh empty one per API call.
  if (cookie) headers.Cookie = cookie;
  // NOTE: multipart uploads must NOT set Content-Type — RN's FormData adds the
  // boundary itself, and a header without one breaks the server's parsing.
  if (!opts.form) headers['Content-Type'] = 'application/json';

  let lastTransport: unknown = null;

  for (const base of candidates) {
    const url = buildUrl(base, route, opts.query);
    let res;
    try {
      res = await axios.request({
        url,
        method: opts.method ?? 'GET',
        data: opts.form ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
        headers,
        timeout: opts.timeout ?? 30000,
        validateStatus: () => true,
      });
    } catch (err) {
      // Transport failure (network / TLS / expired cert). If another base URL
      // remains (e.g. https → http), fall through to it before giving up.
      lastTransport = err;
      continue;
    }

    // Keep the shared PHP session alive for the WebView screens.
    await mergeCookie(res.headers?.['set-cookie']);

    let payload: any = res.data;
    if (typeof payload === 'string') {
      try {
        payload = payload.trim() === '' ? null : JSON.parse(payload);
      } catch {
        // Not JSON: an IIS/PHP error page or a redirect. Report the status.
        throw new ApiError(
          `Unexpected response from the server (HTTP ${res.status}).`,
          res.status
        );
      }
    }

    if (res.status >= 200 && res.status < 300) {
      return payload as T;
    }

    const message =
      (payload && typeof payload === 'object' && (payload.error || payload.message)) ||
      `Request failed (HTTP ${res.status}).`;
    throw new ApiError(String(message), res.status);
  }

  throw networkError(candidates[0]);
}

/** GET helper. */
export function apiGet<T>(route: string, query?: Record<string, QueryValue>): Promise<T> {
  return apiRequest<T>(route, { query });
}

/** POST helper (JSON body). */
export function apiPost<T>(
  route: string,
  body?: unknown,
  query?: Record<string, QueryValue>
): Promise<T> {
  return apiRequest<T>(route, { method: 'POST', body, query });
}
