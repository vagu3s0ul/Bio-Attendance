/**
 * Scheduled WhatsApp reminders.
 *
 * WhatsApp itself cannot send a message in the background (platform rule), so
 * a scheduled reminder is a LOCAL notification at the chosen time whose tap
 * opens the pre-filled chat. The queue of scheduled reminders is kept in
 * SecureStore so it can be listed and cancelled from the app.
 */
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Linking, Platform } from 'react-native';

const STORE_KEY = 'sps_scheduled_reminders';
const CHANNEL_ID = 'defaulter-reminders';

export interface ScheduledReminder {
  /** expo-notifications identifier (used to cancel). */
  id: string;
  /** ISO timestamp of the fire time. */
  when: string;
  title: string;
  body: string;
  /** wa.me link opened when the notification is tapped. */
  link: string;
  student: string;
  roll: string;
}

// Foreground presentation: show the banner so the tap is possible.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Android needs a channel before the first notification (idempotent). */
export async function ensureNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Defaulter reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  } catch {
    // A missing channel only downgrades presentation; scheduling still works.
  }
}

/** Ask for notification permission; returns true when granted. */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const asked = await Notifications.requestPermissionsAsync();
    return asked.granted;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Persisted list
// ---------------------------------------------------------------------------

export async function listScheduledReminders(): Promise<ScheduledReminder[]> {
  try {
    const raw = await SecureStore.getItemAsync(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return (parsed as ScheduledReminder[]).filter(
      (r) => r && typeof r.id === 'string' && Date.parse(r.when) > now - 60_000
    );
  } catch {
    return [];
  }
}

async function writeScheduled(list: ScheduledReminder[]): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(list));
  } catch {
    // Storage failure only loses the in-app list, not the notification itself.
  }
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

export interface ScheduleInput {
  when: Date;
  title: string;
  body: string;
  link: string;
  student: string;
  roll: string;
}

/**
 * Schedule one reminder. Returns the stored reminder, or throws with a message
 * the screen can show (permission denied / time in the past).
 */
export async function scheduleReminder(input: ScheduleInput): Promise<ScheduledReminder> {
  if (input.when.getTime() <= Date.now()) {
    throw new Error('That time has already passed — pick a later time.');
  }

  const granted = await ensureNotificationPermission();
  if (!granted) {
    throw new Error(
      'Notifications are turned off for Bio Attendance. Allow them in Android settings to schedule reminders.'
    );
  }

  await ensureNotificationChannel();

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: input.title,
      body: input.body,
      data: { link: input.link },
      sound: true,
    },
    trigger: { date: input.when, channelId: CHANNEL_ID },
  });

  const reminder: ScheduledReminder = {
    id,
    when: input.when.toISOString(),
    title: input.title,
    body: input.body,
    link: input.link,
    student: input.student,
    roll: input.roll,
  };

  const list = await listScheduledReminders();
  await writeScheduled([...list, reminder]);
  return reminder;
}

/** Cancel one scheduled reminder (both the OS entry and the stored row). */
export async function cancelReminder(id: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Already fired or removed — still drop it from the list.
  }
  const list = await listScheduledReminders();
  await writeScheduled(list.filter((r) => r.id !== id));
}

/** Cancel everything (scheduled OS entries + the stored list). */
export async function cancelAllReminders(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // ignore
  }
  await writeScheduled([]);
}

/**
 * Open the WhatsApp chat of a tapped reminder. Returns the subscription so the
 * root layout can remove it on unmount.
 */
export function listenForReminderTaps(): { remove: () => void } {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as { link?: unknown };
    const link = typeof data?.link === 'string' ? data.link : '';
    if (link) Linking.openURL(link).catch(() => undefined);
  });
  return sub;
}
