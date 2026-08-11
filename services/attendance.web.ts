/**
 * Web shim for services/attendance.ts — in-memory storage (no SecureStore)
 * so the browser preview works. Marks are lost on reload on web only.
 */

const webMaps: Record<string, Record<string, string[]>> = {};

function keyOf(className: string): string {
  return `att_absent_${className.trim().replace(/[^a-zA-Z0-9._-]/g, '')}`;
}

export async function getAbsentRolls(
  className: string,
  date: string
): Promise<string[]> {
  const list = webMaps[keyOf(className)]?.[date];
  return Array.isArray(list) ? [...list] : [];
}

export async function setAbsentRolls(
  className: string,
  date: string,
  rolls: string[]
): Promise<void> {
  const map = (webMaps[keyOf(className)] = webMaps[keyOf(className)] || {});
  map[date] = [...rolls];
}
