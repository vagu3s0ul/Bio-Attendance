/**
 * High-level API for the SPS attendance site.
 *
 * Every call goes to the site's JSON API (api.php) with the bearer token
 * issued at login. No HTML is fetched or parsed.
 */
import { getBaseUrl, getToken, getUser, setToken, setUser } from './settings';
import { ApiError, apiGet, apiPost, apiRequest } from './http';
import {
  AuditFilterOptions,
  AuditRecord,
  EntryFormData,
  EntrySaveResult,
  ManagePage,
  ManageResult,
  ProfileData,
  ReportResult,
  ReportStudent,
  todayISO,
} from './domain';
import { HomeData, Role, SessionExpiredError, SessionUser } from '@/types';

/**
 * Run a request, translating an expired/invalid token into SessionExpiredError
 * so screens can send the user back to the login screen.
 */
async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) throw new SessionExpiredError();
    throw e;
  }
}

/**
 * Log in against api.php. The server returns the user's real role
 * (teachers.role) plus a bearer token, both of which we persist.
 */
export async function login(username: string, password: string): Promise<SessionUser> {
  let res: {
    token: string;
    user: { username: string; name: string; role: Role; className: string };
  };

  try {
    res = await apiRequest('auth/login', {
      method: 'POST',
      auth: false,
      body: { username, password },
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      throw new Error('Invalid username or password');
    }
    throw e;
  }

  if (!res || !res.token || !res.user) {
    throw new Error('Unexpected response from server. Check the server URL in Settings.');
  }

  await setToken(res.token);
  const user: SessionUser = {
    username: res.user.username,
    name: res.user.name || res.user.username,
    role:
      res.user.role === 'admin'
        ? 'admin'
        : res.user.role === 'accountant'
        ? 'accountant'
        : res.user.role === 'principal'
        ? 'principal'
        : res.user.role === 'section_head'
        ? 'section_head'
        : 'teacher',
  };
  await setUser(user);
  return user;
}

export async function logout(): Promise<void> {
  if (await getToken()) {
    try {
      await apiPost('auth/logout');
    } catch {
      // server unreachable — still clear locally
    }
  }
  await setToken(null);
  await setUser(null);
}

/** Whether the currently-stored session belongs to an admin. */
export async function currentRole(): Promise<Role | null> {
  const u = await getUser();
  return u ? u.role : null;
}

/**
 * Fetch the role-appropriate dashboard for the native Home screen. If the
 * server now reports a different role than we have stored (e.g. an admin
 * changed the account), persist the fresh role.
 */
export async function fetchHome(): Promise<HomeData> {
  const user = await getUser();
  if (!user) throw new SessionExpiredError();

  const data = await call(() =>
    apiGet<{ role: Role; stats: any; classes?: any[] }>('home')
  );

  if (data.role !== user.role) {
    await setUser({ ...user, role: data.role });
  }

  // Every role gets its own HomeData variant — never coerce a non-teacher
  // role to 'teacher' or the principal/section-head dashboards become dead code.
  switch (data.role) {
    case 'teacher':
      return { role: 'teacher', stats: data.stats };
    case 'admin':
      return { role: 'admin', stats: data.stats, classes: data.classes || [] };
    case 'accountant':
      return { role: 'accountant', stats: data.stats, classes: data.classes || [] };
    case 'principal':
      return { role: 'principal', stats: data.stats, classes: data.classes || [] };
    case 'section_head':
      return { role: 'section_head', stats: data.stats, classes: data.classes || [] };
  }
}

/** A staff notice / message sent to this user. */
export interface Notice {
  id: number;
  subject: string;
  body: string;
  from: string;
  created_at: string;
  read: boolean;
}

/** Fetch the notices visible to the current user. */
export async function fetchNotices(): Promise<Notice[]> {
  const data = await call(() => apiGet<{ notices: Notice[] }>('notices/list'));
  return data.notices || [];
}

/** Mark a set of notice ids as read. */
export async function markNoticesRead(ids: number[]): Promise<void> {
  if (!ids.length) return;
  await call(() => apiPost('notices/mark_read', { ids }));
}

/**
 * Post an executive order into the staff notice feed (principal / admin).
 * It lands in every teacher's Notices list, labelled with the principal's
 * shield highlight because the sender is the principal account.
 */
export async function sendExecutiveOrder(q: {
  subject: string;
  body: string;
}): Promise<{ ok: boolean; id: number }> {
  return call(() =>
    apiPost<{ ok: boolean; id: number }>('notices/send', {
      subject: q.subject,
      body: q.body,
      audience: 'teachers',
    })
  );
}

/** One teacher's sign-in line on the Staff Punctuality screen. */
export interface PunctualityRow {
  username: string;
  name: string;
  className: string;
  wing: string;
  /** False until the teacher enters attendance today. */
  hasEntry: boolean;
  /** "08:12 AM" — the day's first entry, null before it happens. */
  entryAt: string | null;
  late: boolean;
  /** Days inside the window with an on-time first entry. */
  onTime: number;
  /** Days inside the window with a late first entry. */
  lateDays: number;
  /** Days with any entry at all (the rate's denominator). */
  days: number;
  /** Percentage of recorded days that were on time. */
  rate: number;
}

export interface PunctualityData {
  date: string;
  from: string;
  days: number;
  /** "09:30 AM" */
  deadline: string;
  stats: {
    total: number;
    onTimeToday: number;
    lateToday: number;
    pendingToday: number;
    avgRate: number;
  };
  rows: PunctualityRow[];
}

/**
 * Teacher punctuality against the entry cutoff: today's first entry per
 * teacher plus their on-time rate over the recent window (principal / heads).
 */
export async function fetchPunctuality(days = 14): Promise<PunctualityData> {
  return call(() => apiGet<PunctualityData>('staff/punctuality', { days }));
}

/**
 * Fetch the Daily Entry form for a given date (defaults to today): the
 * students of the signed-in teacher's class plus their saved state.
 */
export async function fetchEntry(date?: string): Promise<EntryFormData> {
  return call(() => apiGet<EntryFormData>('entry', { date }));
}

/**
 * Submit the entry checklist.
 *
 * `fields` keeps the shape the screen builds (the site's original form field
 * names): `record_date` plus `records[<roll>][<checkpoint>]` and
 * `records[<roll>][remarks]`, with `is_absent` posted for every student. These
 * are converted into the API's structured payload here, so the screen is
 * unchanged.
 */
export async function submitEntry(fields: Record<string, string>): Promise<EntrySaveResult> {
  const date = fields.record_date || fields.date || todayISO();
  const records: Record<string, Record<string, string | number>> = {};

  for (const [key, value] of Object.entries(fields)) {
    const m = key.match(/^records\[([^\]]+)\]\[([^\]]+)\]$/);
    if (!m) continue;
    const [, roll, field] = m;
    if (!records[roll]) records[roll] = {};
    // Form values are strings: '0' is truthy in JS, so compare explicitly.
    // Checkboxes post 'on'; attendance posts '1' (absent) or '0' (present).
    records[roll][field] =
      field === 'remarks' ? value : value === '1' || value === 'on' || value === 'true' ? 1 : 0;
  }

  // A record with no is_absent posted (older builds) means present.
  for (const record of Object.values(records)) {
    if (record.is_absent === undefined) record.is_absent = 0;
  }

  const res = await call(() =>
    apiPost<{ ok?: boolean; message?: string }>('entry/save', { date, records })
  );

  return {
    ok: res?.ok !== false,
    message: res?.message || (res?.ok === false ? 'Could not save. Please try again.' : 'Entries saved successfully.'),
  };
}

// ---------------------------------------------------------------------------
// Face attendance
// ---------------------------------------------------------------------------

export interface FaceStudent {
  roll: string;
  name: string;
  samples: number;
  embeddings: number[][];
  present: boolean;
}

export interface FaceRoster {
  class: string;
  date: string;
  threshold: number;
  total: number;
  enrolled: number;
  present: number;
  students: FaceStudent[];
}

/** Roster + enrolled embeddings for a class (teacher: own class). */
export async function fetchFaceRoster(q: { className?: string; date?: string } = {}): Promise<FaceRoster> {
  return call(() => apiGet<FaceRoster>('face/roster', { class: q.className, date: q.date }));
}

/** Store up to five embeddings for one student (replaces earlier samples). */
export async function enrollFaceStudent(q: {
  className?: string;
  roll: string;
  embeddings: number[][];
}): Promise<ManageResult & { samples?: number }> {
  const res = await call(() =>
    apiPost<{ ok?: boolean; message?: string; samples?: number }>('face/enroll', {
      class: q.className,
      roll: q.roll,
      embeddings: q.embeddings,
    })
  );
  return {
    ok: res?.ok !== false,
    message: res?.message || (res?.ok === false ? 'Could not save the face.' : 'Face saved.'),
    samples: res?.samples,
  };
}

/** Delete a student's enrolled face data. */
export async function clearFaceStudent(q: { className?: string; roll: string }): Promise<ManageResult> {
  const res = await call(() =>
    apiPost<{ ok?: boolean; message?: string }>('face/clear', {
      class: q.className,
      roll: q.roll,
    })
  );
  return {
    ok: res?.ok !== false,
    message: res?.message || (res?.ok === false ? 'Could not remove the face data.' : 'Face data removed.'),
  };
}

/**
 * Save a face-attendance session. Only recognised students are posted, so
 * everyone else stays absent. The server creates a record when missing and,
 * when a teacher already saved a full entry, only clears is_absent — the
 * uniform checks and remarks are never overwritten.
 */
export async function saveFaceAttendance(
  rolls: string[],
  date = todayISO(),
  className?: string,
  markAbsent = false
): Promise<EntrySaveResult> {
  if (rolls.length === 0) {
    return { ok: true, message: 'No students were detected, so nothing was saved.' };
  }

  const res = await call(() =>
    apiPost<{ ok?: boolean; message?: string }>('face/mark', {
      date,
      rolls,
      class: className,
      mark_absent: markAbsent,
    })
  );

  return {
    ok: res?.ok !== false,
    message:
      res?.message ||
      (res?.ok === false
        ? 'Could not save the face attendance.'
        : `Face attendance saved for ${rolls.length} student${rolls.length === 1 ? '' : 's'}.`),
  };
}

// ---------------------------------------------------------------------------
// Manage (admin only)
// ---------------------------------------------------------------------------

export interface ManageQuery {
  search?: string;
  filterClass?: string;
  page?: number;
}

/** Fetch teachers/students (optionally filtered). */
export async function fetchManagePage(q: ManageQuery = {}): Promise<ManagePage> {
  return call(() =>
    apiGet<ManagePage>('manage', {
      search: q.search,
      filter_class: q.filterClass,
      page: q.page && q.page > 1 ? q.page : undefined,
    })
  );
}

async function manageAction(body: Record<string, unknown>): Promise<ManageResult> {
  const res = await call(() =>
    apiPost<{ ok?: boolean; message?: string }>('manage/action', body)
  );
  return {
    ok: res?.ok !== false,
    message: res?.message || (res?.ok === false ? 'Action failed. Please try again.' : 'Done.'),
  };
}

export function addTeacher(f: { username: string; password: string; name: string; className: string; role: string }): Promise<ManageResult> {
  return manageAction({ action: 'add_teacher', username: f.username, password: f.password, name: f.name, class: f.className, role: f.role });
}

export function addStudent(f: { className: string; rollno: string; name: string }): Promise<ManageResult> {
  return manageAction({ action: 'add_student', class: f.className, rollno: f.rollno, name: f.name });
}

export function editStudent(f: { id: string; className: string; rollno: string; name: string }): Promise<ManageResult> {
  return manageAction({ action: 'edit_student', id: f.id, class: f.className, rollno: f.rollno, name: f.name });
}

export function deleteTeacher(id: number): Promise<ManageResult> {
  return manageAction({ action: 'delete_teacher', id });
}

export function deleteStudent(id: number): Promise<ManageResult> {
  return manageAction({ action: 'delete_student', id });
}

/** Bulk-delete (deactivate) students, optionally limited to the given classes; omit/empty = all classes. */
export function bulkDeleteStudents(opts: { classes?: string[]; all?: boolean } = {}): Promise<ManageResult> {
  return manageAction({
    action: 'bulk_delete_students',
    classes: opts.classes && opts.classes.length ? opts.classes : undefined,
    all: opts.all ? 1 : 0,
  });
}

/** Bulk-import students from a CSV or Excel file (name, reg number, class, section, WhatsApp number). */
export async function bulkUploadStudents(
  file: { uri: string; name: string; type: string },
  opts: { flush?: boolean } = {}
): Promise<ManageResult> {
  const form = new FormData();
  form.append('action', 'bulk_upload');
  if (opts.flush) form.append('flush', '1');
  form.append('csv_file', {
    uri: file.uri,
    name: file.name,
    type: file.type || 'text/csv',
  } as any);

  const res = await call(() =>
    apiRequest<{ ok?: boolean; message?: string }>('manage/upload', {
      method: 'POST',
      form,
      timeout: 60000,
    })
  );
  return {
    ok: res?.ok !== false,
    message: res?.message || (res?.ok === false ? 'Upload failed.' : 'Upload complete.'),
  };
}

// ---------------------------------------------------------------------------
// Deadline (admin only)
// ---------------------------------------------------------------------------

/** Update the daily attendance deadline. */
export async function updateDeadline(time: string): Promise<ManageResult> {
  const res = await call(() =>
    apiPost<{ ok?: boolean; message?: string; deadline?: string }>('settings/deadline', { deadline: time })
  );
  return {
    ok: res?.ok !== false,
    message: res?.message || `Deadline set to ${time}.`,
  };
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export type ReportType = 'daily' | 'weekly' | 'monthly' | 'student';

/** Admin: the class list shown in report filters (teacher: own class only). */
export async function fetchReportClasses(): Promise<string[]> {
  return call(() => apiGet<string[]>('reports/classes'));
}

/** Students for the student-wise report (teacher: their own class). */
export async function fetchReportStudents(className?: string): Promise<ReportStudent[]> {
  return call(() => apiGet<ReportStudent[]>('reports/students', { class: className }));
}

/** Fetch a report with the native filters. */
export async function fetchReport(f: {
  type: ReportType;
  date?: string; // daily / weekly (YYYY-MM-DD)
  month?: string; // monthly (YYYY-MM)
  className?: string; // admin class filter ('' = all classes)
  studentId?: string; // student-wise
}): Promise<ReportResult> {
  return call(() =>
    apiGet<ReportResult>('reports/run', {
      type: f.type,
      date: f.type === 'weekly' ? undefined : f.date,
      week: f.type === 'weekly' ? f.date : undefined,
      month: f.month,
      class: f.className,
      student: f.studentId,
    })
  );
}

// ---------------------------------------------------------------------------
// Daily Reckoner (Principal / Section Head / admin)
// ---------------------------------------------------------------------------

export interface ReckonerClassRow {
  class: string;
  sec: string;
  total: number;
  present: number;
  absent: number;
  unmarked: number;
  absent_rolls: number[];
}

export interface ReckonerBlock {
  key: string;
  title: string;
  classes: ReckonerClassRow[];
  grand_total: number;
  total_present: number;
  total_absent: number;
  unmarked: number;
  attendance_pct: number;
}

export interface ReckonerData {
  date: string;
  blocks: ReckonerBlock[];
}

/**
 * Fetch the Daily Reckoner for a date (defaults to today server-side).
 * Blocks are scoped server-side: a section head sees only their own wing,
 * the principal and admin see all four blocks (Pre-School, Boys, Girls,
 * College). Total = active students; present/absent come from that day's
 * records; unmarked = students with no record that day.
 */
export async function fetchReckoner(date?: string): Promise<ReckonerData> {
  return call(() => apiGet<ReckonerData>('reports/reckoner', { date }));
}

/**
 * Admin audit (Teacher-wise report) with its native filters
 * (class / teacher / date range / on-time-or-late).
 */
export async function fetchAuditPage(f?: {
  className?: string;
  teacher?: string;
  from?: string;
  to?: string;
  filterType?: string;
}): Promise<{ options: AuditFilterOptions; records: AuditRecord[] }> {
  return call(() =>
    apiGet<{ options: AuditFilterOptions; records: AuditRecord[] }>('audit', {
      class: f?.className,
      teacher: f?.teacher,
      from: f?.from,
      to: f?.to,
      filter_type: f?.filterType,
    })
  );
}

// ---------------------------------------------------------------------------
// Profile (name, class, late warnings)
// ---------------------------------------------------------------------------

export async function fetchProfile(): Promise<ProfileData> {
  const user = await getUser();
  if (!user) throw new SessionExpiredError();
  return call(() => apiGet<ProfileData>('profile'));
}

/** Resolve a page slug to a full URL for the WebView screens. */
export async function pageUri(slug: string): Promise<string> {
  const base = await getBaseUrl();
  const role = await currentRole();
  const map: Record<string, string> = {
    entry: '/entry.php',
    audit: '/audit.php',
    manage: '/manage.php',
    export: role === 'admin' ? '/admin_export.php' : '/export.php',
    reports: role === 'admin' ? '/admin_reports.php' : '/reports.php',
    dashboard: role === 'admin' ? '/admin_dashboard.php' : '/teacher_dashboard.php',
    staff_dashboard: '/staff_dashboard.php',
    notifications: '/notifications-admin.html',
  };
  return base + (map[slug] || `/${slug}.php`);
}

/** Human-readable title for a page slug (WebView header). */
export function pageTitle(slug: string): string {
  const titles: Record<string, string> = {
    entry: 'Daily Entry',
    reports: 'Reports',
    audit: 'Audit Trail',
    manage: 'Manage',
    export: 'Export Data',
    dashboard: 'Dashboard',
    notifications: 'Send App Notification',
  };
  return titles[slug] || slug;
}
