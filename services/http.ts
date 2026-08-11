/**
 * Session-aware HTTP client for the PHP site.
 * Follows redirects automatically (RN XHR), captures Set-Cookie headers and
 * replays the stored PHPSESSID on every request.
 */
import axios, { AxiosRequestConfig } from 'axios';
import { getBaseUrl, getCookie, mergeCookie, MOBILE_UA } from './settings';

export async function httpGet(
  path: string,
  config: AxiosRequestConfig = {}
): Promise<string> {
  const base = await getBaseUrl();
  const cookie = await getCookie();
  const res = await axios.get(base + path, {
    ...config,
    timeout: config.timeout ?? 30000,
    headers: {
      'User-Agent': MOBILE_UA,
      Accept: 'text/html,application/xhtml+xml,*/*',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(config.headers || {}),
    },
  });
  await mergeCookie(res.headers?.['set-cookie']);
  return typeof res.data === 'string' ? res.data : '';
}

export async function httpPostForm(
  path: string,
  fields: Record<string, string>,
  config: AxiosRequestConfig = {}
): Promise<string> {
  const base = await getBaseUrl();
  const cookie = await getCookie();
  const body = Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const res = await axios.post(base + path, body, {
    ...config,
    timeout: config.timeout ?? 30000,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': MOBILE_UA,
      Accept: 'text/html,application/xhtml+xml,*/*',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(config.headers || {}),
    },
  });
  await mergeCookie(res.headers?.['set-cookie']);
  return typeof res.data === 'string' ? res.data : '';
}

/** POST a multipart form (used for the CSV bulk upload). */
export async function httpPostMultipart(
  path: string,
  fields: Record<string, string>,
  file: { field: string; uri: string; name: string; type: string }
): Promise<string> {
  const base = await getBaseUrl();
  const cookie = await getCookie();
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append(file.field, {
    uri: file.uri,
    name: file.name,
    type: file.type || 'text/csv',
  } as any);
  const res = await axios.post(base + path, form, {
    timeout: 60000,
    headers: {
      // NOTE: do NOT set Content-Type here — RN's FormData handling generates
      // the multipart boundary automatically. An explicit header without a
      // boundary can break the server's parsing.
      'User-Agent': MOBILE_UA,
      Accept: 'text/html,application/xhtml+xml,*/*',
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
  await mergeCookie(res.headers?.['set-cookie']);
  return typeof res.data === 'string' ? res.data : '';
}
