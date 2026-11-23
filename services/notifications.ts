/**
 * In-app notification receiver (no Play Store / FCM dependency).
 *
 * The school site (attendance.spscsialkot.com) hosts a notification feed at
 *   api.php?r=notifications/list   (GET, bearer token)
 * returning:
 *   { notifications: [
 *       { id, title, body, created_at, image?, link?, attachment? }
 *   ] }
 * `image`/`attachment` are absolute URLs; `link` is an optional URL to open.
 *
 * The app polls this feed (on startup and periodically), shows a local
 * notification for anything newer than the last seen id, and keeps an inbox
 * the user can open from the bell icon.
 */
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Linking, Platform } from 'react-native';
import { apiGet } from './http';
import { getBaseUrl } from './settings';

const LAST_SEEN_KEY = 'sps_notif_last_seen';

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
          data: { link: n.link, attachment: n.attachment, image: n.image },
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

