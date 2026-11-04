/**
 * Web shim for services/reminders.ts.
 *
 * Scheduled reminders are local Android notifications, so the browser build
 * has nothing to schedule. The API matches the native module so screens can
 * import one path and the bundle never pulls expo-notifications on web.
 */
export interface ScheduledReminder {
  id: string;
  when: string;
  title: string;
  body: string;
  link: string;
  student: string;
  roll: string;
}

export interface ScheduleInput {
  when: Date;
  title: string;
  body: string;
  link: string;
  student: string;
  roll: string;
}

export async function ensureNotificationChannel(): Promise<void> {}

export async function ensureNotificationPermission(): Promise<boolean> {
  return false;
}

export async function listScheduledReminders(): Promise<ScheduledReminder[]> {
  return [];
}

export async function scheduleReminder(_input: ScheduleInput): Promise<ScheduledReminder> {
  throw new Error('Scheduled reminders are only available in the Android app.');
}

export async function cancelReminder(_id: string): Promise<void> {}

export async function cancelAllReminders(): Promise<void> {}

export function listenForReminderTaps(): { remove: () => void } {
  return { remove: () => undefined };
}
