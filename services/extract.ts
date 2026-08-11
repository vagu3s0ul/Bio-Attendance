/**
 * HTML extraction helpers.
 *
 * The PHP site is server-rendered HTML (no JSON API), so the native shell
 * parses just enough of the dashboard pages to show fast, native cards.
 * The heavy pages (entry, reports, audit, manage, export) are rendered in a
 * WebView where the original HTML stays the source of truth.
 */

export function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].trim() : '';
}

export function isLoginError(html: string): boolean {
  return /invalid username or password/i.test(html);
}

/** True when the page is the login page (i.e. our session was not accepted). */
export function isLoginPage(html: string): boolean {
  return /Login - /.test(extractTitle(html));
}

/** Strip scripts/styles/tags and collapse whitespace into a single line. */
export function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseAdminStats(html: string) {
  const t = stripTags(html);
  const num = (re: RegExp) => {
    const m = t.match(re);
    return m ? parseInt(m[1], 10) : 0;
  };
  const deadlineM = t.match(/Current Deadline:\s*([^ ]+ [^ ]+)/i);
  return {
    teachers: num(/(\d+)\s*Teachers/i),
    students: num(/(\d+)\s*Students/i),
    classes: num(/(\d+)\s*Classes/i),
    todayEntries: num(/(\d+)\s*Today'?s\s*Entries/i),
    deadline: deadlineM ? deadlineM[1] : '',
  };
}

/** Parse the "Today's Entry Status" rows from the admin dashboard HTML. */
export function parseClassStatus(html: string) {
  const rows: {
    className: string;
    teacher: string;
    students: number;
    entered: number;
    status: string;
  }[] = [];

  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = trRe.exec(html))) {
    const cells = Array.from(
      m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)
    ).map((c) => stripTags(c[1]));

    if (cells.length < 4) continue;

    const className = (cells[0].match(/[A-Z]?\d+[A-Z]?/) || [cells[0]])[0];
    const students = parseInt(cells[2] || '0', 10);
    // Skip the header row and non-class tables (e.g. the deadline form).
    if (!className || isNaN(students)) continue;

    const statusText = cells.slice(4).join(' ');
    let status = statusText || '';
    if (/Not Done|✗/.test(statusText)) status = 'Not Done';
    else if (/✓|Done/.test(statusText)) status = 'Done';
    else if (/Late/.test(statusText)) status = 'Late';
    else if (/Partial/.test(statusText)) status = 'Partial';

    rows.push({
      className,
      teacher: cells[1] || '',
      students,
      entered: parseInt(cells[3] || '0', 10),
      status,
    });
  }
  return rows;
}

/** Local-time YYYY-MM-DD (avoids the UTC off-by-one in toISOString). */
export function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Parse the Daily Entry form (entry.php).
 *
 * The site renders a POST checklist: one row per student with a checkbox per
 * checkpoint (uniform/shoes/socks/haircut/nails/bag) plus a remarks input.
 * We read the REAL field names from the HTML (rather than guessing them) so
 * the native form submits exactly what a browser would submit.
 */
export const CHECKPOINTS = ['uniform', 'shoes', 'socks', 'haircut', 'nails', 'bag'] as const;
export type CheckpointKey = (typeof CHECKPOINTS)[number];

export interface EntryCheckbox {
  key: CheckpointKey;
  name: string;
  value: string; // checkbox value attr (browsers submit this, default 'on')
  checked: boolean;
}

export interface EntryStudent {
  roll: string;
  name: string;
  checkboxes: EntryCheckbox[];
  remarks: { name: string; value: string } | null;
  /** True when the site's form has the student marked Absent; null when the
   *  site hasn't been updated with the Status column yet. */
  absent: boolean | null;
}

export interface EntryFormData {
  /** record_date hidden input (the date this form writes to). */
  date: string;
  /** "Class: ALL" / "Class: 6A" label from the header. */
  classLabel: string;
  /** max attribute of the date picker, if any. */
  maxDate: string | null;
  students: EntryStudent[];
  /** Other hidden inputs inside the form (re-submitted verbatim). */
  hiddenFields: { name: string; value: string }[];
  /** True when the page shows the "after deadline" warning. */
  afterDeadline: boolean;
}

export function parseEntryForm(html: string): EntryFormData {
  const form = html.match(/<form[^>]*method=["']?post["']?[^>]*>([\s\S]*?)<\/form>/i);
  const body = form ? form[1] : html;

  const date =
    (body.match(/<input[^>]*name=["']record_date["'][^>]*value=["']([^"']*)["']/i) || [])[1] ||
    todayISO();

  const maxDate =
    (html.match(/<input[^>]*type=["']date["'][^>]*name=["']date["'][^>]*max=["']([^"']*)["']/i) || [])[1] || null;

  const classLabel = (html.match(/<small[^>]*>\s*Class:\s*([^<]+)/i) || [])[1]?.trim() || 'Class: ALL';

  const afterDeadline = /entering data after the deadline/i.test(html);

  const hiddenFields: { name: string; value: string }[] = [];
  for (const m of body.matchAll(/<input[^>]*type=["']hidden["'][^>]*>/gi)) {
    const name = (m[0].match(/name=["']([^"']*)["']/) || [])[1];
    const value = (m[0].match(/value=["']([^"']*)["']/) || ['', ''])[1] || '';
    if (name && name !== 'record_date') hiddenFields.push({ name, value });
  }

  const students: EntryStudent[] = [];
  const tbody = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (tbody) {
    const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let m: RegExpExecArray | null;
    while ((m = trRe.exec(tbody[1]))) {
      const cells = Array.from(m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)).map((c) => c[1]);
      if (cells.length < 4) continue;

      const roll = stripTags(cells[0]).replace(/^\s*(Roll#?\s*)?/i, '').trim();
      const name = stripTags(cells[1]).trim();
      if (!name) continue;

      // Present/Absent Status cell (col-status). Null when the site doesn't
      // have the column yet (older page) — caller falls back to local data.
      const statusCell = cells.find((c) => c.includes('col-status')) || '';
      const statusCheckbox =
        statusCell.match(/<input[^>]*type=["']checkbox["'][^>]*>/i)?.[0] || '';
      const absent = statusCell
        ? /checked|checked=["']?checked/i.test(statusCheckbox)
        : null;

      const checkboxes: EntryCheckbox[] = [];
      for (let i = 0; i < CHECKPOINTS.length; i++) {
        const key = CHECKPOINTS[i];
        // Match by the col-* class marker (robust to column order/shifts,
        // e.g. the Status column inserted before Uniform); fall back to the
        // original column position.
        const cell = cells.find((c) => c.includes(`col-${key}`)) || cells[i + 2] || '';
        const checkboxHtml =
          cell.match(/<input[^>]*class=["'][^"']*col-[a-z]+[^"']*["'][^>]*>/i)?.[0] ||
          cell.match(/<input[^>]*type=["']checkbox["'][^>]*>/i)?.[0] ||
          '';
        if (!checkboxHtml) continue;
        const nameAttr = (checkboxHtml.match(/name=["']([^"']*)["']/) || [])[1] || '';
        if (!nameAttr) continue;
        checkboxes.push({
          key,
          name: nameAttr,
          value: (checkboxHtml.match(/value=["']([^"']*)["']/) || ['', 'on'])[1] || 'on',
          checked: /checked|checked=["']?checked/i.test(checkboxHtml),
        });
      }

      // Remarks input — last cell, usually a text input.
      const lastCell = cells[cells.length - 1] || '';
      const remarksInput =
        lastCell.match(/<input[^>]*type=["']text["'][^>]*>/i)?.[0] ||
        lastCell.match(/<input(?![^>]*type=["']checkbox["'])[^>]*>/i)?.[0] ||
        '';
      const remarksName = (remarksInput.match(/name=["']([^"']*)["']/) || [])[1] || '';
      const remarksValue = (remarksInput.match(/value=["']([^"']*)["']/) || ['', ''])[1] || '';

      students.push({
        roll,
        name,
        checkboxes,
        remarks: remarksName ? { name: remarksName, value: remarksValue } : null,
        absent,
      });
    }
  }

  return { date, classLabel, maxDate, students, hiddenFields, afterDeadline };
}

/** Result of a Save Entries POST. */
export interface EntrySaveResult {
  ok: boolean;
  message: string;
}

export function parseEntrySaveResult(html: string): EntrySaveResult {
  if (/data saved successfully/i.test(html) || /alert-success/i.test(html)) {
    return { ok: true, message: 'Entries saved successfully.' };
  }
  // Prefer explicit danger alerts over generic .alert (e.g. the deadline warning).
  const m =
    html.match(/class=["'][^"']*alert-(?:danger|error)[^"']*["'][^>]*>\s*([\s\S]*?)<\/div>/i) ||
    html.match(/class=["'][^"']*alert[^"']*["'][^>]*>\s*([\s\S]*?)<\/div>/i);
  const message = m ? stripTags(m[1] || '').replace(/^\s*[⚠️✏️]+\s*/, '') : '';
  return { ok: false, message: message || 'Could not save. Please try again.' };
}

// ---------------------------------------------------------------------------
// Manage (admin): teachers & students
// ---------------------------------------------------------------------------

export interface ManageTeacher {
  id: number;
  username: string;
  name: string;
  className: string; // "ALL" for the admin account
  role: 'admin' | 'teacher';
}

export interface ManageStudent {
  id: number;
  className: string;
  roll: string;
  name: string;
}

export interface ManagePage {
  classes: string[]; // filter options ("All Classes" omitted)
  students: ManageStudent[];
  teachers: ManageTeacher[];
  totalStudents: number; // "Showing 20 of 622"
  page: number;
  totalPages: number;
  search: string;
  filterClass: string;
}

/** Parse the teachers + students tables on manage.php. */
export function parseManagePage(html: string): ManagePage {
  // Class filter options
  const classes: string[] = [];
  const select = html.match(/<select[^>]*name=["']filter_class["'][^>]*>([\s\S]*?)<\/select>/i);
  if (select) {
    for (const m of select[1].matchAll(/<option[^>]*>([^<]*)<\/option>/gi)) {
      const v = m[1].trim();
      if (v && v !== 'All Classes' && !classes.includes(v)) classes.push(v);
    }
  }

  // Teachers
  const teachers: ManageTeacher[] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = trRe.exec(html))) {
    if (!/delete_teacher/.test(m[1])) continue;
    const cells = Array.from(m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)).map((c) => stripTags(c[1]).trim());
    if (cells.length < 4) continue;
    const idM = m[1].match(/delete_teacher["'][^>]*>\s*<input[^>]*name=["']id["'][^>]*value=["'](\d+)/i) ||
      m[1].match(/name=["']id["'][^>]*value=["'](\d+)["'][^>]*>\s*<\/form>/i);
    if (!idM) continue;
    teachers.push({
      id: parseInt(idM[1], 10),
      username: cells[0],
      name: cells[1],
      className: cells[2] || 'ALL',
      role: /admin/i.test(cells[3]) ? 'admin' : 'teacher',
    });
  }

  // Students
  const students: ManageStudent[] = [];
  while ((m = trRe.exec(html))) {
    if (!/delete_student/.test(m[1])) continue;
    const cells = Array.from(m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)).map((c) => stripTags(c[1]).trim());
    if (cells.length < 4) continue;
    const idM = m[1].match(/delete_student["'][^>]*>\s*<input[^>]*name=["']id["'][^>]*value=["'](\d+)/i) ||
      m[1].match(/name=["']id["'][^>]*value=["'](\d+)["'][^>]*>\s*<\/form>/i);
    if (!idM) continue;
    students.push({ id: parseInt(idM[1], 10), className: cells[0], roll: cells[1], name: cells[2] });
  }

  // Pagination + totals
  const showM = html.match(/Showing\s*\d+\s*of\s*(\d+)/i);
  const totalStudents = showM ? parseInt(showM[1], 10) : 0;
  const pageNums = Array.from(html.matchAll(/page=(\d+)/gi)).map((x) => parseInt(x[1], 10));
  const totalPages = pageNums.length ? Math.max(...pageNums) : 1;
  // The current page's anchor carries the btn-primary class.
  const curPage =
    html.match(/href="[^"]*page=(\d+)[^"]*"[^>]*class="[^"]*btn-primary/i)?.[1] ||
    html.match(/class="[^"]*btn-primary[^"]*"[^>]*href="[^"]*page=(\d+)/i)?.[1];
  const page = curPage ? parseInt(curPage, 10) : 1;
  const search = (html.match(/name=["']search["'][^>]*value=["']([^"']*)/i) || [])[1] || '';
  const filterClass = (html.match(/<select[^>]*name=["']filter_class["'][^>]*>[\s\S]*?<option[^>]*selected[^>]*>([^<]*)/i) || [])[1]?.trim() || '';

  return { classes, students, teachers, totalStudents, page, totalPages, search, filterClass };
}

/** Result of an add/edit/delete POST on manage.php. */
export interface ManageResult {
  ok: boolean;
  message: string;
}

export function parseManageResult(html: string): ManageResult {
  const m =
    html.match(/class=["'][^"']*alert-(?:danger|error)["'][^>]*>\s*([\s\S]*?)<\/div>/i) ||
    html.match(/class=["'][^"']*alert-success["'][^>]*>\s*([\s\S]*?)<\/div>/i) ||
    html.match(/class=["'][^"']*alert["'][^>]*>\s*([\s\S]*?)<\/div>/i);
  const msg = m ? stripTags(m[1] || '').trim() : '';
  if (/error|failed|invalid|already|exist|duplicate|missing/i.test(msg) && !/success/i.test(msg)) {
    return { ok: false, message: msg || 'Action failed. Please try again.' };
  }
  if (/success/i.test(msg) || /added|updated|deleted|deactivated|uploaded|saved/i.test(msg)) {
    return { ok: true, message: msg || 'Done.' };
  }
  return { ok: true, message: msg || 'Done.' };
}

// ---------------------------------------------------------------------------
// Profile & deadline
// ---------------------------------------------------------------------------

export interface ProfileData {
  role: 'admin' | 'teacher';
  name: string;
  className: string; // "ALL" for admin, "6A" for a teacher
  lateWarnings: number;
  lateRate: number; // % (admin only, from audit)
  deadline: string;
  hasLateData: boolean;
}

/** Name + assigned class from a dashboard page (user-name block). */
export function parseProfileBasics(html: string): { name: string; className: string } {
  const name =
    (html.match(/class=["']user-name["'][^>]*>\s*([^<]+)/i) || [])[1]?.trim() || '';
  // NOTE: defaults to '' (not 'ALL') so an unknown page can never be mistaken
  // for an admin landing by role detection.
  const className =
    (html.match(/Class:\s*([^<]+)/i) || [])[1]?.trim() || '';
  return { name, className };
}

/** Admin audit stats: Late/Backdated + late rate. */
export interface AuditStats {
  total: number;
  onTime: number;
  late: number;
  lateRate: number;
}

export function parseAuditStats(html: string): AuditStats {
  const t = stripTags(html);
  const num = (re: RegExp) => {
    const m = t.match(re);
    return m ? parseInt(m[1], 10) : 0;
  };
  const rate = t.match(/(\d+(?:\.\d+)?)%?\s*Late Rate/i);
  return {
    total: num(/(\d+)\s*Total Records/i),
    onTime: num(/(\d+)\s*On Time/i),
    late: num(/(\d+)\s*Late\/Backdated/i),
    lateRate: rate ? parseFloat(rate[1]) : 0,
  };
}

/** Best-effort count of late rows in a report table (teacher's own class). */
export function parseReportLateCount(html: string): number {
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html))) {
    if (/class=["'][^"']*late["']/i.test(m[1]) || /\b(?:late|backdated)\b/i.test(stripTags(m[1]))) {
      count++;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Reports (daily / monthly / student-wise)
// ---------------------------------------------------------------------------

export interface ReportStudent {
  id: string;
  roll: string;
  name: string;
}

/** Parse a student <select> (report pages) into id/roll/name entries. */
export function parseReportStudents(html: string): ReportStudent[] {
  const out: ReportStudent[] = [];
  const select = html.match(/<select[^>]*name=["']student["'][^>]*>([\s\S]*?)<\/select>/i);
  if (!select) return out;
  for (const m of select[1].matchAll(/<option[^>]*value=["'](\d+)["'][^>]*>([\s\S]*?)<\/option>/gi)) {
    const label = stripTags(m[2]).replace(/\s+/g, ' ').trim();
    const rm = label.match(/^(\d+)\s*-\s*(.*)$/);
    const roll = rm ? rm[1] : label;
    const name = rm ? rm[2].trim() : label;
    if (!name) continue;
    out.push({ id: m[1], roll, name });
  }
  return out;
}

/** Parse the class <select> on the admin report page ("All Classes" excluded). */
export function parseReportClasses(html: string): string[] {
  const out: string[] = [];
  const select = html.match(/<select[^>]*name=["']class["'][^>]*>([\s\S]*?)<\/select>/i);
  if (!select) return out;
  for (const m of select[1].matchAll(/<option[^>]*value=["']([^"']+)["'][^>]*>([^<]*)<\/option>/gi)) {
    const label = m[2].trim();
    if (label && label !== 'All Classes' && !out.includes(label)) out.push(label);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Report RESULT tables (daily / weekly / monthly / student-wise)
// ---------------------------------------------------------------------------

/** One row of a report table (daily/weekly/monthly/student-wise). */
export interface ReportRow {
  date: string; // "09 Aug" / "09 Aug 2026"
  className: string; // '' on teacher pages (no class column)
  roll: string;
  name: string;
  /** uniform/shoes/socks/haircut/nails/bag — '✓', '✗' or '' (not recorded). */
  checkpoints: Record<CheckpointKey, string>;
  remarks: string;
  /** True when the row shows "✗ Absent" in the Status column (false when the
   *  column is absent or the cell reads Present). */
  absent: boolean;
}

export interface ReportResult {
  /** "Daily Report - 09 Aug 2026 (7B)" etc. */
  title: string;
  /** True when the site rendered the "No records" empty state. */
  empty: boolean;
  /** Column order actually present (admin pages include a Class column). */
  hasClassColumn: boolean;
  rows: ReportRow[];
}

/** Checkpoint column headers used by the site's report tables. */
const REPORT_HEADERS: { label: string; key: CheckpointKey }[] = [
  { label: 'U', key: 'uniform' },
  { label: 'Sh', key: 'shoes' },
  { label: 'So', key: 'socks' },
  { label: 'H', key: 'haircut' },
  { label: 'N', key: 'nails' },
  { label: 'B', key: 'bag' },
];

/**
 * Parse a report page (reports.php / admin_reports.php) into structured rows.
 * Column layout is derived from the header row, so both the teacher page
 * (Date|Roll#|Name|U..B|Remarks) and the admin page (Date|Class|Roll#|Name|U..B|Remarks)
 * work. "No records" renders as an empty result with `empty: true`.
 */
export function parseReportResult(html: string): ReportResult {
  // The page has two <h2>s ("🔍 Report Filters" + "X Report - …"); take the
  // one that actually describes the result.
  const h2s = Array.from(html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)).map((m) =>
    stripTags(m[1]).replace(/\s+/g, ' ').trim()
  );
  const title =
    h2s.find((h) => /report/i.test(h) && h.includes('-')) || h2s[h2s.length - 1] || '';

  const empty = /No records/i.test(html);

  const rows: ReportRow[] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  let header: string[] | null = null;
  while ((m = trRe.exec(html))) {
    const cells = Array.from(m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)).map((c) =>
      stripTags(c[1]).replace(/\s+/g, ' ').trim()
    );
    if (cells.length < 4) continue;

    // First pass — find the header row (contains "Roll#" / "Name").
    if (!header) {
      if (cells.some((c) => /roll/i.test(c)) && cells.some((c) => /name/i.test(c))) {
        header = cells;
      }
      continue;
    }

    const nameIdx = header.indexOf('Name');
    const rollIdx = header.findIndex((h) => /roll/i.test(h));
    if (nameIdx < 0 || rollIdx < 0) continue;
    const hasClass = /^class$/i.test(header[0] || '') || /^class$/i.test(header[1] || '');

    // Student-name cells carry class="student-name" — skip aggregate rows if any.
    if (!/student-name/i.test(m[1])) continue;

    const checkpoints = {} as Record<CheckpointKey, string>;
    for (const { label, key } of REPORT_HEADERS) {
      const idx = header.findIndex((h) => h === label);
      checkpoints[key] = idx >= 0 ? cells[idx] || '' : '';
    }
    const remarksIdx = header.findIndex((h) => /^remarks$/i.test(h));
    const statusIdx = header.findIndex((h) => /^status$/i.test(h));

    const date = cells[0] || '';
    const className = hasClass ? cells[1] || '' : '';
    const roll = cells[rollIdx] || '';
    const name = cells[nameIdx] || '';

    rows.push({
      date,
      className,
      roll,
      name,
      checkpoints,
      remarks: remarksIdx >= 0 ? cells[remarksIdx] || '' : '',
      absent: statusIdx >= 0 ? /absent|✗/i.test(cells[statusIdx] || '') : false,
    });
  }

  return { title, empty, hasClassColumn: header ? /^class$/i.test(header[1] || '') : false, rows };
}

/**
 * Compliance summary derived from parsed report rows.
 * compliant/total per checkpoint + overall % (per student fully compliant).
 */
export function summarizeReport(result: ReportResult): {
  perCheckpoint: { key: CheckpointKey; label: string; compliant: number; total: number }[];
  totalStudents: number;
  fullyCompliant: number;
  absentCount: number;
} {
  const total = result.rows.length;
  const perCheckpoint = REPORT_HEADERS.map(({ label, key }) => {
    let compliant = 0;
    for (const r of result.rows) if (r.checkpoints[key] === '✓') compliant++;
    return { key, label, compliant, total };
  });
  const fullyCompliant = result.rows.filter((r) =>
    REPORT_HEADERS.every(({ key }) => r.checkpoints[key] === '✓')
  ).length;
  const absentCount = result.rows.filter((r) => r.absent).length;
  return { perCheckpoint, totalStudents: total, fullyCompliant, absentCount };
}

// ---------------------------------------------------------------------------
// Audit (admin-only Teacher-wise report)
// ---------------------------------------------------------------------------

export interface AuditFilterOptions {
  classes: string[];
  teachers: { username: string; label: string }[];
  from: string; // YYYY-MM-DD (defaults from the page)
  to: string;
  filterType: string; // all | late | on_time
}

/** Parse the audit page's filter form (class/teacher/from/to/type). */
export function parseAuditFilters(html: string): AuditFilterOptions {
  const select = (name: string): string[] => {
    const m = html.match(new RegExp(`<select[^>]*name=["']${name}["'][^>]*>([\\s\\S]*?)<\\/select>`, 'i'));
    if (!m) return [];
    const out: string[] = [];
    for (const o of m[1].matchAll(/<option[^>]*value=["']([^"']*)["'][^>]*>([^<]*)<\/option>/gi)) {
      const label = o[2].trim();
      if (label && !out.includes(label) && label !== 'All Classes' && label !== 'All Teachers') {
        out.push(label);
      }
    }
    return out;
  };
  const teachers: { username: string; label: string }[] = [];
  const tm = html.match(/<select[^>]*name=["']teacher["'][^>]*>([\s\S]*?)<\/select>/i);
  if (tm) {
    for (const o of tm[1].matchAll(/<option[^>]*value=["']([^"']*)["'][^>]*>([^<]*)<\/option>/gi)) {
      const label = o[2].trim();
      if (label && label !== 'All Teachers') teachers.push({ username: o[1], label });
    }
  }
  const val = (name: string): string =>
    (html.match(new RegExp(`<input[^>]*name=["']${name}["'][^>]*value=["']([^"']*)["']`, 'i')) || [])[1] || '';
  return {
    classes: select('class'),
    teachers,
    from: val('from'),
    to: val('to'),
    filterType: val('filter_type') || 'all',
  };
}

/** One row of the audit table (teacher-wise report). */
export interface AuditRecord {
  date: string;
  className: string;
  roll: string;
  student: string;
  enteredBy: string;
  created: string;
  updated: string;
  daysLate: string;
  ip: string;
}

export function parseAuditRecords(html: string): AuditRecord[] {
  const out: AuditRecord[] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  let header: string[] | null = null;
  while ((m = trRe.exec(html))) {
    const cells = Array.from(m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)).map((c) =>
      stripTags(c[1]).replace(/\s+/g, ' ').trim()
    );
    if (cells.length < 4) continue;
    if (!header) {
      if (/Record Date/i.test(cells[0] || '')) {
        header = cells;
      }
      continue;
    }
    const g = (i: number) => cells[i] || '';
    out.push({
      date: g(0),
      className: g(1),
      roll: g(2),
      student: g(3),
      enteredBy: g(4),
      created: g(5),
      updated: g(6),
      daysLate: g(7),
      ip: g(8),
    });
  }
  return out;
}

export function parseTeacherStats(html: string) {
  const t = stripTags(html);
  const num = (re: RegExp) => {
    const m = t.match(re);
    return m ? parseInt(m[1], 10) : 0;
  };
  const ent = t.match(/(\d+)\s*\/\s*(\d+)\s*Today'?s\s*Entries/i);
  const dl = t.match(/completed by\s+([^ ]+ [^ ]+)/i);
  return {
    totalStudents: num(/(\d+)\s*Total\s*Students/i),
    entered: ent ? parseInt(ent[1], 10) : 0,
    total: ent ? parseInt(ent[2], 10) : 0,
    daysThisMonth: num(/(\d+)\s*Days\s*This\s*Month/i),
    deadline: dl ? dl[1] : '',
  };
}
