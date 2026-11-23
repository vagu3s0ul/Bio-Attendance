import { Platform } from 'react-native';
import * as Location from 'expo-location';

// Sialkot Public School & College — 8km Pasrur Road, near Islam Teaching Hospital, Sialkot.
export const SCHOOL = {
  latitude: 32.4239311,
  longitude: 74.5836257,
};

// Allowed radius around the school campus (metres).
export const SCHOOL_RADIUS_METERS = 300;

// Grace period after the daily deadline before marking is blocked (minutes).
export const GRACE_MINUTES = 30;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in metres between two lat/lon points. */
export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface GuardResult {
  ok: boolean;
  reason?: string;
  distance?: number;
}

/** Request foreground location permission if needed. */
export async function ensureLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status === 'granted') return true;
    const req = await Location.requestForegroundPermissionsAsync();
    return req.status === 'granted';
  } catch {
    return false;
  }
}

/** Read the device's current coordinates, or null on failure. */
export async function getCurrentCoords(): Promise<{ latitude: number; longitude: number } | null> {
  if (Platform.OS === 'web') return null;
  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  } catch {
    return null;
  }
}

/** True when the device is inside the school geofence. */
export async function isAtSchool(): Promise<GuardResult> {
  if (Platform.OS === 'web') {
    // Web build cannot reliably verify location; allow (native app is the target).
    return { ok: true };
  }
  if (!(await ensureLocationPermission())) {
    return { ok: false, reason: 'Location permission is required to mark attendance.' };
  }
  const coords = await getCurrentCoords();
  if (!coords) {
    return { ok: false, reason: 'Could not read your location. Enable GPS and try again.' };
  }
  const distance = distanceMeters(coords.latitude, coords.longitude, SCHOOL.latitude, SCHOOL.longitude);
  if (distance > SCHOOL_RADIUS_METERS) {
    return {
      ok: false,
      reason: `You are ${Math.round(distance)} m from school. Attendance can only be marked on campus.`,
      distance,
    };
  }
  return { ok: true, distance };
}

/** Parse a deadline string ("09:30" or "09:30 AM") into minutes-since-midnight. */
function parseDeadlineMinutes(deadline: string): number | null {
  const m = deadline.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (/pm/i.test(m[3] || '') && h < 12) h += 12;
  if (/am/i.test(m[3] || '') && h === 12) h = 0;
  return h * 60 + mm;
}

/** True when the current time is within the deadline + grace window. */
export function attendanceTimeAllowed(deadline: string): GuardResult {
  const mins = parseDeadlineMinutes(deadline);
  if (mins === null) return { ok: true };
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const cutoff = mins + GRACE_MINUTES;
  if (nowMinutes > cutoff) {
    return {
      ok: false,
      reason: `Attendance marking closed ${GRACE_MINUTES} minutes after the ${deadline} deadline.`,
    };
  }
  return { ok: true };
}

/** Combined guard used before any attendance save. */
export async function canMarkAttendance(deadline: string): Promise<GuardResult> {
  const time = attendanceTimeAllowed(deadline);
  if (!time.ok) return time;
  return isAtSchool();
}