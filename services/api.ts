/**
 * High-level API for the SPS attendance PHP site.
 * All calls reuse the stored PHP session cookie.
 */
import { getBaseUrl, getUser, setUser } from './settings';
import { httpGet, httpPostForm, httpPostMultipart } from './http';
import {
  AuditFilterOptions,
  AuditRecord,
  AuditStats,
  EntryFormData,
  EntrySaveResult,
  extractTitle,
  isLoginError,
  isLoginPage,
  ManagePage,
  ManageResult,
  parseAdminStats,
  parseAuditFilters,
  parseAuditRecords,
  parseAuditStats,
  parseClassStatus,
  parseEntryForm,
  parseEntrySaveResult,
  parseManagePage,
  parseManageResult,
  parseProfileBasics,
  parseReportClasses,
  parseReportLateCount,
  parseReportResult,
  parseReportStudents,
  parseTeacherStats,
  ProfileData,
  ReportResult,
  todayISO,
} from './extract';

/**
 * Derive the user's role from the landing page the server actually returned.
 * The PHP app's session knows the real role (teachers.role); we read its
 * signals rather than guessing. Defaults to 'teacher' — NEVER 'admin' — so a
 * detection failure can't accidentally show admin UI to a teacher.
 */
function detectRole(html: string, title: string): Role {
  const t = title.toLowerCase();
  if (/admin dashboard/i.test(t)) return 'admin';
  const basics = parseProfileBasics(html);
  if (basics.className === 'ALL' || /administrator/i.test(basics.name)) return 'admin';
  return 'teacher';
}
import { HomeData, ReportStudent, Role, SessionExpiredError, SessionUser } from '@/types';

/**
 * Log in against index.php. Detects the user's role from the landing page
 * title ("Admin Dashboard" → admin, "Dashboard" → teacher).
 */
export async function login(username: string, password: string): Promise<SessionUser> {
  const base = await getBaseUrl();

  // Touch the login page first so the server issues a PHPSESSID.
  await httpGet('/index.php').catch(() => undefined);

  const html = await httpPostForm('/index.php', { username, password });
  if (isLoginError(html)) {
    throw new Error('Invalid username or password');
  }

  const title = extractTitle(html);
  if (isLoginPage(html) || !/dashboard/i.test(title)) {
    throw new Error('Unexpected response from server. Check the server URL in Settings.');
  }

  // Role comes from the page the server chose for THIS session (the site's
  // session knows the real teachers.role). Read fresh per login; never reuse
  // a cached value from a previous account.
  const role: Role = detectRole(html, title);
  const basics = parseProfileBasics(html);
  const user: SessionUser = { username, name: basics.name || username, role };
  await setUser(user);
  return user;
}

export async function logout(): Promise<void> {
  try {
    await httpGet('/logout.php');
  } catch {
    // server unreachable — still clear locally
  }
  await setUser(null);
}

/** Whether the currently-stored session belongs to an admin. */
export async function currentRole(): Promise<Role | null> {
  const u = await getUser();
  return u ? u.role : null;
}

/**
 * Fetch + parse the role-appropriate dashboard for the native Home screen.
 * If the server now serves a different role's page than we have stored (e.g.
 * an admin flipped a user's role in the DB), re-derive and persist it.
 */
export async function fetchHome(): Promise<HomeData> {
  const user = await getUser();
  if (!user) throw new SessionExpiredError();

  let role = user.role;
  let html = await httpGet(role === 'admin' ? '/admin_dashboard.php' : '/teacher_dashboard.php');
  if (isLoginPage(html)) throw new SessionExpiredError();

  const actual = detectRole(html, extractTitle(html));
  if (actual !== role) {
    // Role changed server-side — re-fetch the right page and persist.
    role = actual;
    await setUser({ ...user, role });
    html = await httpGet(role === 'admin' ? '/admin_dashboard.php' : '/teacher_dashboard.php');
    if (isLoginPage(html)) throw new SessionExpiredError();
  }

  if (role === 'admin') {
    return { role, stats: parseAdminStats(html), classes: parseClassStatus(html) };
  }
  return { role, stats: parseTeacherStats(html) };
}

/**
 * Fetch + parse the Daily Entry form for a given date (defaults to today).
 * The native entry screen renders this as design-faithful student cards and
 * submits the exact same checkbox field names back.
 */
export async function fetchEntry(date?: string): Promise<EntryFormData> {
  const html = await httpGet(date ? `/entry.php?date=${date}` : '/entry.php');
  if (isLoginPage(html)) throw new SessionExpiredError();
  return parseEntryForm(html);
}

/** Submit the entry checklist back to the site (same fields a browser sends). */
export async function submitEntry(
  fields: Record<string, string>
): Promise<EntrySaveResult> {
  const html = await httpPostForm('/entry.php', fields);
  if (isLoginPage(html)) throw new SessionExpiredError();
  return parseEntrySaveResult(html);
}

// ---------------------------------------------------------------------------
// Manage (admin only)
// ---------------------------------------------------------------------------

export interface ManageQuery {
  search?: string;
  filterClass?: string;
  page?: number;
}

/** Fetch the manage page (optionally filtered) and parse teachers/students. */
export async function fetchManagePage(q: ManageQuery = {}): Promise<ManagePage> {
  const params = new URLSearchParams();
  if (q.search) params.set('search', q.search);
  if (q.filterClass) params.set('filter_class', q.filterClass);
  if (q.page && q.page > 1) params.set('page', String(q.page));
  const qs = params.toString();
  const html = await httpGet('/manage.php' + (qs ? `?${qs}` : ''));
  if (isLoginPage(html)) throw new SessionExpiredError();
  return parseManagePage(html);
}

async function manageAction(fields: Record<string, string>): Promise<ManageResult> {
  const html = await httpPostForm('/manage.php', fields);
  if (isLoginPage(html)) throw new SessionExpiredError();
  return parseManageResult(html);
}

// NOTE: the PHP forms use `class` as the field name (not className).
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
  return manageAction({ action: 'delete_teacher', id: String(id) });
}

export function deleteStudent(id: number): Promise<ManageResult> {
  return manageAction({ action: 'delete_student', id: String(id) });
}

/** Bulk-import students from a CSV (class, rollno, name) via manage.php. */
export async function bulkUploadStudents(file: {
  uri: string;
  name: string;
  type: string;
}): Promise<ManageResult> {
  const html = await httpPostMultipart(
    '/manage.php',
    { action: 'bulk_upload' },
    { field: 'csv_file', uri: file.uri, name: file.name, type: file.type }
  );
  if (isLoginPage(html)) throw new SessionExpiredError();
  return parseManageResult(html);
}

// ---------------------------------------------------------------------------
// Deadline (admin only)
// ---------------------------------------------------------------------------

/** Update the daily attendance deadline on the admin dashboard. */
export async function updateDeadline(time: string): Promise<ManageResult> {
  const html = await httpPostForm('/admin_dashboard.php', {
    update_deadline: '1',
    deadline: time,
  });
  if (isLoginPage(html)) throw new SessionExpiredError();
  const fresh = parseManageResult(html);
  if (/error|failed|invalid/i.test(fresh.message) && !fresh.ok) return fresh;
  return { ok: true, message: `Deadline set to ${time}.` };
}

// ---------------------------------------------------------------------------
// Reports (native filters drive the real PHP report pages)
// ---------------------------------------------------------------------------

export type ReportType = 'daily' | 'weekly' | 'monthly' | 'student';

/** Admin: the class list shown in report filters (from admin_reports.php). */
export async function fetchReportClasses(): Promise<string[]> {
  const html = await httpGet('/admin_reports.php');
  if (isLoginPage(html)) throw new SessionExpiredError();
  return parseReportClasses(html);
}

/**
 * Students for the student-wise report.
 * Admin: two-step — pass a class to load only that class's students
 * (the site populates its dropdown only after a class is chosen).
 * Teacher: session-scoped — the page only ever lists their own class.
 */
export async function fetchReportStudents(className?: string): Promise<ReportStudent[]> {
  const user = await getUser();
  if (!user) throw new SessionExpiredError();
  const path =
    user.role === 'admin'
      ? `/admin_reports.php?class=${encodeURIComponent(className || '')}&type=student`
      : '/reports.php?type=student';
  const html = await httpGet(path);
  if (isLoginPage(html)) throw new SessionExpiredError();
  return parseReportStudents(html);
}

/**
 * Fetch + parse a report page natively (no WebView). Role-aware page choice
 * (admin_reports.php vs reports.php), session cookie reused automatically.
 */
export async function fetchReport(f: {
  type: ReportType;
  date?: string; // daily / weekly (YYYY-MM-DD)
  month?: string; // monthly (YYYY-MM)
  className?: string; // admin class filter ('' = all classes)
  studentId?: string; // student-wise
}): Promise<ReportResult> {
  const user = await getUser();
  if (!user) throw new SessionExpiredError();
  const q = new URLSearchParams();
  q.set('type', f.type);
  if (f.date) q.set(f.type === 'weekly' ? 'week' : 'date', f.date);
  if (f.month) q.set('month', f.month);
  if (f.studentId) q.set('student', f.studentId);
  if (user.role === 'admin' && f.className) q.set('class', f.className);
  const page = user.role === 'admin' ? '/admin_reports.php' : '/reports.php';
  const html = await httpGet(page + '?' + q.toString());
  if (isLoginPage(html)) throw new SessionExpiredError();
  return parseReportResult(html);
}

/**
 * Fetch + parse the admin audit page (Teacher-wise report) with its native
 * filters (class / teacher / date range / on-time-or-late).
 */
export async function fetchAuditPage(f?: {
  className?: string;
  teacher?: string;
  from?: string;
  to?: string;
  filterType?: string;
}): Promise<{ options: AuditFilterOptions; records: AuditRecord[] }> {
  const q = new URLSearchParams();
  if (f?.className) q.set('class', f.className);
  if (f?.teacher) q.set('teacher', f.teacher);
  if (f?.from) q.set('from', f.from);
  if (f?.to) q.set('to', f.to);
  if (f?.filterType) q.set('filter_type', f.filterType);
  const qs = q.toString();
  const html = await httpGet('/audit.php' + (qs ? '?' + qs : ''));
  if (isLoginPage(html)) throw new SessionExpiredError();
  return { options: parseAuditFilters(html), records: parseAuditRecords(html) };
}

// ---------------------------------------------------------------------------
// Profile (name, class, late warnings)
// ---------------------------------------------------------------------------

export async function fetchProfile(): Promise<ProfileData> {
  const user = await getUser();
  if (!user) throw new SessionExpiredError();
  const role = user.role;
  const dash = await httpGet(role === 'admin' ? '/admin_dashboard.php' : '/teacher_dashboard.php');
  if (isLoginPage(dash)) throw new SessionExpiredError();
  const basics = parseProfileBasics(dash);
  const deadline =
    (dash.match(/Current Deadline:\s*([^<]+)/i) || [])[1]?.trim() ||
    (dash.match(/completed by\s+([^<]+?)\s*\(/i) || [])[1]?.trim() ||
    '09:30 AM';

  if (role === 'admin') {
    const audit = await httpGet('/audit.php').catch(() => '');
    const stats: AuditStats = audit ? parseAuditStats(audit) : { total: 0, onTime: 0, late: 0, lateRate: 0 };
    return {
      role,
      name: basics.name || user.name || user.username,
      className: basics.className || 'ALL',
      lateWarnings: stats.late,
      lateRate: stats.lateRate,
      deadline,
      hasLateData: true,
    };
  }

  // Teacher: count late rows in their own class's daily report (best effort).
  const report = await httpGet(`/reports.php?type=daily&date=${todayISO()}`).catch(() => '');
  const late = report ? parseReportLateCount(report) : 0;
  return {
    role,
    name: basics.name || user.name || user.username,
    className: basics.className || '—',
    lateWarnings: late,
    lateRate: 0,
    deadline,
    hasLateData: true,
  };
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
  };
  return titles[slug] || slug;
}
