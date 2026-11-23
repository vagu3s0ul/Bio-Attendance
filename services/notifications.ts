/**
 * Notification receiver: real push (Expo Push via FCM) + in-app polling fallback.
 *
 * HOW IT WORKS
 * - PUSH (primary): on login the app registers its Expo push token with the
 *   server (`notifications/register-token`). When an admin sends a notification
 *   from notifications-admin.html, the server pushes it to every registered
 *   token via the Expo Push API, so it pops up on the phone even with the app
 *   closed or killed. Tapping it opens the notifications inbox.
 * - POLLING (fallback): the app also polls `notifications/list` on startup,
 *   every 30s while open, and on returning to foreground, and fires a local
 *   notification for anything newer than the last seen id. This covers phones
 *   whose push token is missing or stale.
 * - DEDUPE: a push carries the notification id in its data. When a push is
 *   received (foreground) or tapped, that id is recorded as seen, so the
 *   polling pass does not fire a second local copy. Edge case: a teacher who
 *   dismisses a push without tapping and then opens the app may see the same
 *   item once more from polling — the inbox itself never shows duplicates.
 *
 * The school site (140.245.1.42) hosts the feed at
 *   api.php?r=notifications/list   (GET, bearer token)
 * returning:
 *   { notifications: [
 *       { id, title, body, created_at, image?, link?, attachment? }
 *   ] }
 * `image`/`attachment` are absolute URLs; `link` is an optional URL to open.
 *
 * Push needs an EAS project id in app.json (`extra.eas.projectId`) and a
 * Firebase project (google-services.json in android/app). Without them,
 * registerPushToken() quietly does nothing and polling keeps working.
 */
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Alert, Linking, Platform } from 'react-native';
import { apiGet, apiPost } from './http';
import { getBaseUrl } from './settings';

const LAST_SEEN_KEY = 'sps_notif_last_seen';
const PUSH_TOKEN_KEY = 'sps_push_token';

export interface AppNotification {
  id: number | string;
  title: string;
  body: string;
  created_at?: string;
  image?: string;
  link?: string;
  attachment?: string;
}

let handlerSet = false;

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0047bb',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
    });
  } catch {
    // ignore
  }
}

function ensureHandler() {
  if (handlerSet) return;
  handlerSet = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  void ensureChannel();
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  ensureHandler();
  await ensureChannel();
  try {
    const settings = await Notifications.getPermissionsAsync();
    if (settings.granted) return true;
    const req = await Notifications.requestPermissionsAsync();
    return !!req.granted;
  } catch {
    return false;
  }
}

/** The Expo project id, when the app was built with one configured. */
function getProjectId(): string | null {
  const id = (Constants.expoConfig as any)?.extra?.eas?.projectId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * Register this phone for push notifications. Called after login and on
 * startup while signed in. Quietly does nothing when push is not configured
 * (no project id) or permission is denied — polling keeps working.
 * Returns true when a token was registered (or was already registered).
 */
export async function registerPushToken(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const projectId = getProjectId();
  if (!projectId) return false;
  try {
    const granted = await requestNotificationPermission();
    if (!granted) return false;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (!token) return false;
    const stored = await SecureStore.getItemAsync(PUSH_TOKEN_KEY).catch(() => null);
    if (stored === token) return true;
    await apiPost('notifications/register-token', { token, platform: Platform.OS });
    await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

export async function fetchNotifications(): Promise<AppNotification[]> {
  try {
    const data = await apiGet<{ notifications?: AppNotification[] }>('notifications/list');
    return Array.isArray(data?.notifications) ? data.notifications : [];
  } catch {
    return [];
  }
}

export async function getLastSeenId(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(LAST_SEEN_KEY);
  } catch {
    return null;
  }
}

export async function setLastSeenId(id: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(LAST_SEEN_KEY, id);
  } catch {
    // non-fatal
  }
}

/**
 * Poll the feed and fire a local notification for each item newer than the
 * last seen id. Returns the number of new notifications shown.
 */
export async function pollNotifications(): Promise<number> {
  if (Platform.OS === 'web') return 0;
  ensureHandler();
  const list = await fetchNotifications();
  if (list.length === 0) return 0;

  const lastSeen = await getLastSeenId();
  // items assumed newest-first; find new ones.
  const newItems: AppNotification[] = [];
  for (const n of list) {
    if (lastSeen && String(n.id) === lastSeen) break;
    newItems.push(n);
  }
  // If nothing was seen before, only notify about the single newest to avoid spam.
  const toNotify = lastSeen ? newItems : list.slice(0, 1);

  for (const n of toNotify) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: n.title || 'New notification',
          body: n.body || '',
          data: { notificationId: String(n.id), link: n.link, attachment: n.attachment, image: n.image },
          priority: Notifications.AndroidNotificationPriority.HIGH,
          sound: 'default',
        },
        trigger: null,
      });
    } catch {
      // ignore individual failures
    }
  }

  if (list.length > 0) {
    await setLastSeenId(String(list[0].id));
  }
  return toNotify.length;
}

/** Open a link/attachment URL. */
export async function openNotificationTarget(url?: string): Promise<void> {
  if (!url) return;
  try {
    await Linking.openURL(url);
  } catch {
    // ignore
  }
}

function fileNameFromUrl(url: string, fallback: string): string {
  try {
    const clean = url.split('?')[0].split('#')[0];
    const last = clean.substring(clean.lastIndexOf('/') + 1);
    const decoded = decodeURIComponent(last);
    if (decoded && decoded.includes('.')) return decoded.replace(/[^\w.\-]/g, '_');
  } catch {
    // fall through
  }
  return fallback;
}

/**
 * Download an attached file to the phone and open the share sheet, so the
 * teacher can save it to Files / Drive / WhatsApp or open it in another app.
 * Returns true on success. Shows an alert on failure.
 */
export async function downloadAttachment(n: AppNotification): Promise<boolean> {
  if (!n.attachment || Platform.OS === 'web') return false;
  const fileName = fileNameFromUrl(n.attachment, `attachment-${n.id}`);
  const dir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? '';
  const target = `${dir}${fileName}`;
  try {
    const result = await FileSystem.downloadAsync(n.attachment, target);
    if (result.status !== 200) throw new Error(`Download failed (status ${result.status}).`);
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(result.uri, { dialogTitle: fileName });
    } else {
      Alert.alert('Downloaded', `Saved as ${fileName}.`);
    }
    return true;
  } catch (e: any) {
    Alert.alert('Download failed', e?.message || 'Could not download the file.');
    return false;
  }
}
