/** Domain types for the SPS Attendance app. */

export type Role = 'admin' | 'teacher';

export interface SessionUser {
  username: string;
  name: string;
  role: Role;
}

/** Parsed from the admin dashboard page (admin_dashboard.php). */
export interface AdminStats {
  teachers: number;
  students: number;
  classes: number;
  todayEntries: number;
  deadline: string;
}

/** One row of the "Today's Entry Status" table on the admin dashboard. */
export interface ClassStatus {
  className: string;
  teacher: string;
  students: number;
  entered: number;
  status: string; // "Done" | "Not Done" | "Late" | "Partial" | raw text
}

/** Parsed from the teacher dashboard page (teacher_dashboard.php). */
export interface TeacherStats {
  totalStudents: number;
  entered: number;
  total: number; // denominator of today's entries
  daysThisMonth: number;
  deadline: string;
}

export type HomeData =
  | { role: 'admin'; stats: AdminStats; classes: ClassStatus[] }
  | { role: 'teacher'; stats: TeacherStats };

export class SessionExpiredError extends Error {
  constructor() {
    super('Session expired. Please log in again.');
    this.name = 'SessionExpiredError';
  }
}

// Parsers in services/extract.ts own these shapes; re-exported here so screens
// can import domain types from a single place.
export type {
  AuditStats,
  ManagePage,
  ManageResult,
  ManageStudent,
  ManageTeacher,
  ProfileData,
  ReportStudent,
} from '@/services/extract';
