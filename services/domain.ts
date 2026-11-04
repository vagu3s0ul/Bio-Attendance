/**
 * Domain types shared by the app screens.
 *
 * These describe the JSON the site's api.php returns (and would previously
 * have been scraped out of the HTML pages). No parsing lives here any more —
 * the server sends structured data.
 */

/** Checkpoint keys, in the order the site stores them. */
export const CHECKPOINTS = ['uniform', 'shoes', 'socks', 'haircut', 'nails', 'bag'] as const;
export type CheckpointKey = (typeof CHECKPOINTS)[number];

/** Today as YYYY-MM-DD in the device's timezone. */
export function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// Daily entry
// ---------------------------------------------------------------------------

export interface EntryCheckbox {
  key: CheckpointKey;
  name: string;
  value: string; // checkbox value (browsers submit 'on')
  checked: boolean;
}

export interface EntryStudent {
  roll: string;
  name: string;
  checkboxes: EntryCheckbox[];
  remarks: { name: string; value: string } | null;
  /** True when the student is marked Absent; null when the database has no
   *  Status column yet. */
  absent: boolean | null;
}

export interface EntryFormData {
  /** The date this form writes to (YYYY-MM-DD). */
  date: string;
  /** "Class: ALL" / "Class: 6A" from the server. */
  classLabel: string;
  /** Latest date the picker allows, if any. */
  maxDate: string | null;
  students: EntryStudent[];
  /** Legacy hidden inputs — always empty for the JSON API. */
  hiddenFields: { name: string; value: string }[];
  /** True when the server considers this date's entry past the deadline. */
  afterDeadline: boolean;
}

/** Result of saving entries. */
export interface EntrySaveResult {
  ok: boolean;
  message: string;
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
  classes: string[];
  students: ManageStudent[];
  teachers: ManageTeacher[];
  totalStudents: number;
  page: number;
  totalPages: number;
  search: string;
  filterClass: string;
}

/** Result of an add/edit/delete action. */
export interface ManageResult {
  ok: boolean;
  message: string;
}

// ---------------------------------------------------------------------------
// Profile & deadline
// ---------------------------------------------------------------------------

export interface ProfileData {
  role: 'admin' | 'teacher' | 'accountant' | 'principal' | 'section_head';
  name: string;
  className: string; // "ALL" for admin, "6A" for a teacher
  lateWarnings: number;
  lateRate: number; // % (admin only, from the audit summary)
  deadline: string;
  hasLateData: boolean;
}

// ---------------------------------------------------------------------------
// Reports (daily / weekly / monthly / student-wise)
// ---------------------------------------------------------------------------

export interface ReportStudent {
  id: string;
  roll: string;
  name: string;
}

/** One row of a report table. */
export interface ReportRow {
  date: string; // "09 Aug" / "09 Aug 2026"
  className: string; // '' for teachers (no class column)
  roll: string;
  name: string;
  /** uniform/shoes/socks/haircut/nails/bag — '✓', '✗' or '' (not recorded). */
  checkpoints: Record<CheckpointKey, string>;
  remarks: string;
  /** True when the row is marked absent for that date. */
  absent: boolean;
}

export interface ReportResult {
  /** "Daily Report - 09 Aug 2026 (7B)" etc. */
  title: string;
  /** True when the server has no records for the selection. */
  empty: boolean;
  /** Column order present (admin reports include a Class column). */
  hasClassColumn: boolean;
  rows: ReportRow[];
}

/** Checkpoint column headers used by the report tables. */
const REPORT_HEADERS: { label: string; key: CheckpointKey }[] = [
  { label: 'U', key: 'uniform' },
  { label: 'Sh', key: 'shoes' },
  { label: 'So', key: 'socks' },
  { label: 'H', key: 'haircut' },
  { label: 'N', key: 'nails' },
  { label: 'B', key: 'bag' },
];

/**
 * Compliance summary derived from report rows.
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

export interface AuditStats {
  total: number;
  onTime: number;
  late: number;
  lateRate: number;
}

export interface AuditFilterOptions {
  classes: string[];
  teachers: { username: string; label: string }[];
  from: string; // YYYY-MM-DD
  to: string;
  filterType: string; // all | late | on_time
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
