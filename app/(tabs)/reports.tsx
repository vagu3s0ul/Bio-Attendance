/**
 * Native Reports screen.
 *
 * Every filter mode asks api.php for the report JSON (teachers are scoped to
 * their own class server-side, admins get any class) and renders it natively
 * below the filters. No browser/WebView is shown.
 *
 * Role rules (from the implementation spec + the live site):
 *  - Teacher: daily / weekly / monthly / student-wise, own class only. The
 *    student picker is pre-populated immediately with their class's students.
 *    (reports.php offers weekly; admin_reports.php does not.)
 *  - Admin, Principal and Section Head: daily / monthly / student-wise +
 *    a Teacher-wise mode (audit.php — per-teacher completion/punctuality,
 *    rendered natively with its filters). Teachers never see Teacher-wise.
 *    Student-wise is a strict two-step flow: pick a class first, then a student.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect } from 'expo-router';
import Screen from '@/components/Screen';
import AppBar from '@/components/AppBar';
import Card from '@/components/Card';
import { COLORS, FONT, LABEL_CAPS, RADIUS, SPACING } from '@/constants/theme';
import {
  fetchAuditPage,
  fetchReport,
  fetchReportClasses,
  fetchReportStudents,
  type ReportType,
} from '@/services/api';
import { useSession } from '@/store/session';
import {
  AuditFilterOptions,
  CHECKPOINTS,
  ReportResult,
  summarizeReport,
  todayISO,
} from '@/services/domain';
import { ReportStudent, SessionExpiredError } from '@/types';

type Mode = ReportType | 'teachers'; // 'teachers' = admin-only teacher-wise view

const MODES: { key: Mode; label: string; icon: keyof typeof Ionicons.glyphMap; teacherOnly?: boolean }[] = [
  { key: 'daily', label: 'Daily', icon: 'calendar-outline' },
  { key: 'weekly', label: 'Weekly', icon: 'calendar-outline', teacherOnly: true },
  { key: 'monthly', label: 'Monthly', icon: 'calendar-number-outline' },
  { key: 'student', label: 'Student-wise', icon: 'person-outline' },
  { key: 'teachers', label: 'Teacher-wise', icon: 'school-outline' },
];

const CHECK_NAMES: Record<string, string> = {
  uniform: 'Uniform',
  shoes: 'Shoes',
  socks: 'Socks',
  haircut: 'Haircut',
  nails: 'Nails',
  bag: 'Bag',
};

const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function parseISODate(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
}

function isoFromParts(y: number, m: number, d: number): string {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

/** "2026-08-09" -> "Sunday, 09 Aug 2026" (falls back to the raw value). */
function formatDateLong(iso: string): string {
  const p = parseISODate(iso);
  if (!p) return iso;
  const dt = new Date(p.y, p.m, p.d);
  return `${DAYS_FULL[dt.getDay()]}, ${pad2(p.d)} ${MONTHS_SHORT[p.m]} ${p.y}`;
}

/** "2026-08-09" -> "09 Aug 2026" (falls back to the raw value). */
function formatDateShort(iso: string): string {
  const p = parseISODate(iso);
  if (!p) return iso;
  return `${pad2(p.d)} ${MONTHS_SHORT[p.m]} ${p.y}`;
}

/** "2026-08" -> "August 2026" (falls back to the raw value). */
function formatMonthLong(ym: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!match) return ym;
  return `${MONTHS_FULL[Number(match[2]) - 1]} ${match[1]}`;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ReportsScreen() {
  const { user } = useSession();
  const isAdmin = user?.role === 'admin';
  // Teacher-wise is for admin, head (section head) and principal only.
  const canSeeTeacherWise =
    user?.role === 'admin' || user?.role === 'principal' || user?.role === 'section_head';

  const [mode, setMode] = useState<Mode>('daily');
  const [date, setDate] = useState(todayISO());
  const [month, setMonth] = useState(currentMonth());

  // Picker popups (date calendar + months grid), shown above the mode chips.
  const [calOpen, setCalOpen] = useState(false);
  const [calTarget, setCalTarget] = useState<'date' | 'from' | 'to'>('date');
  const [calView, setCalView] = useState({ y: 2026, m: 7 });
  const [monthOpen, setMonthOpen] = useState(false);
  const [monthYear, setMonthYear] = useState(2026);

  // Admin class filter ('' = all classes for daily/monthly; REQUIRED for student-wise)
  const [classes, setClasses] = useState<string[]>([]);
  const [className, setClassName] = useState('');

  // Student-wise
  const [students, setStudents] = useState<ReportStudent[]>([]);
  const [studentId, setStudentId] = useState('');
  const [studentModal, setStudentModal] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');

  // Native report result (all modes)
  const [report, setReport] = useState<ReportResult | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportErr, setReportErr] = useState<string | null>(null);

  // Teacher-wise (admin): audit filters + records
  const [auditOptions, setAuditOptions] = useState<AuditFilterOptions | null>(null);
  const [auditFrom, setAuditFrom] = useState(daysAgoISO(7));
  const [auditTo, setAuditTo] = useState(todayISO());
  const [auditTeacher, setAuditTeacher] = useState('');
  const [auditFilterType, setAuditFilterType] = useState('all');
  const [auditRecords, setAuditRecords] = useState<Awaited<ReturnType<typeof fetchAuditPage>>['records']>([]);
  const [auditGenerated, setAuditGenerated] = useState(false);

  const studentReqRef = React.useRef(0);

  // Admin / head / principal: load the class list once.
  useEffect(() => {
    if (!canSeeTeacherWise) return;
    let active = true;
    fetchReportClasses()
      .then((c) => active && setClasses(c))
      .catch((e: any) => {
        if (e instanceof SessionExpiredError) return; // handled by parent screens
        if (active) setReportErr("Couldn't load class list: " + (e?.message || 'check connection'));
      });
    return () => {
      active = false;
    };
  }, [canSeeTeacherWise]);

  // Admin / head / principal: load the audit filter options (teacher-wise) once.
  useEffect(() => {
    if (!canSeeTeacherWise) return;
    let active = true;
    fetchAuditPage()
      .then(({ options }) => {
        if (!active) return;
        setAuditOptions(options);
        if (options.from) setAuditFrom(options.from);
        if (options.to) setAuditTo(options.to);
      })
      .catch(() => {
        // silent — the teacher-wise generate will surface the error
      });
    return () => {
      active = false;
    };
  }, [canSeeTeacherWise]);

  // Teacher: student-wise picker is pre-populated immediately with their class.
  // Admin: students load only after a class is chosen (two-step flow).
  const loadStudents = useCallback(async (cls: string) => {
    setReportLoading(true);
    setReportErr(null);
    const req = ++studentReqRef.current;
    try {
      const list = await fetchReportStudents(cls);
      if (req !== studentReqRef.current) return; // a newer request superseded this one
      setStudents(list);
      setStudentId('');
    } catch (e: any) {
      if (e instanceof SessionExpiredError) {
        Alert.alert('Session expired', 'Please log in again.');
        return;
      }
      if (req === studentReqRef.current) {
        setReportErr("Couldn't load students: " + (e?.message || 'check connection'));
      }
    } finally {
      if (req === studentReqRef.current) setReportLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode !== 'student') return;
    if (!isAdmin) {
      // Teacher — own class, no extra step.
      loadStudents('');
      return;
    }
    // Admin — only after a class is chosen.
    if (className) {
      loadStudents(className);
    } else {
      studentReqRef.current++;
      setStudents([]);
      setStudentId('');
      setReportLoading(false);
    }
  }, [mode, isAdmin, className, loadStudents]);

  const pickMode = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    setReport(null);
    setReportErr(null);
    setCalOpen(false);
    setMonthOpen(false);
    if (m !== 'student') setStudentId('');
  };

  // --- Date calendar + months grid popups (picker above the mode chips) ---
  const openCal = (target: 'date' | 'from' | 'to') => {
    const iso = target === 'from' ? auditFrom : target === 'to' ? auditTo : date;
    const p = parseISODate(iso);
    setCalTarget(target);
    if (p) setCalView({ y: p.y, m: p.m });
    setMonthOpen(false);
    setCalOpen((prev) => !(prev && calTarget === target));
  };

  const pickCalDay = (day: number) => {
    const iso = isoFromParts(calView.y, calView.m, day);
    if (calTarget === 'from') setAuditFrom(iso);
    else if (calTarget === 'to') setAuditTo(iso);
    else setDate(iso);
    setCalOpen(false);
  };

  const openMonths = () => {
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    setMonthYear(match ? Number(match[1]) : new Date().getFullYear());
    setCalOpen(false);
    setMonthOpen((prev) => !prev);
  };

  const pickMonth = (mi: number) => {
    setMonth(`${monthYear}-${pad2(mi + 1)}`);
    setMonthOpen(false);
  };

  const generate = async () => {
    if (mode === 'teachers') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(auditFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(auditTo)) {
        setReportErr('Enter both dates as YYYY-MM-DD.');
        return;
      }
      setReportErr(null);
      setReportLoading(true);
      setAuditGenerated(false);
      try {
        const page = await fetchAuditPage({
          className: className || undefined,
          teacher: auditTeacher || undefined,
          from: auditFrom,
          to: auditTo,
          filterType: auditFilterType,
        });
        setAuditOptions(page.options || auditOptions);
        setAuditRecords(page.records);
        setAuditGenerated(true);
      } catch (e: any) {
        if (e instanceof SessionExpiredError) {
          Alert.alert('Session expired', 'Please log in again.');
          return;
        }
        setReportErr(e?.message || "Couldn't generate the report.");
      } finally {
        setReportLoading(false);
      }
      return;
    }
    if ((mode === 'daily' || mode === 'weekly') && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setReportErr('Enter the date as YYYY-MM-DD.');
      return;
    }
    if (mode === 'monthly' && !/^\d{4}-\d{2}$/.test(month)) {
      setReportErr('Enter the month as YYYY-MM.');
      return;
    }
    if (mode === 'student') {
      if (isAdmin && !className) {
        setReportErr('Pick a class first — student-wise reports are class-scoped.');
        return;
      }
      if (!studentId) {
        setReportErr('Pick a student.');
        return;
      }
    }
    setReportErr(null);
    setReportLoading(true);
    setReport(null);
    try {
      const result = await fetchReport({
        type: mode as ReportType,
        date: mode === 'daily' || mode === 'weekly' ? date : undefined,
        month: mode === 'monthly' ? month : undefined,
        className: isAdmin ? className : undefined,
        studentId: mode === 'student' ? studentId : undefined,
      });
      setReport(result);
    } catch (e: any) {
      if (e instanceof SessionExpiredError) {
        Alert.alert('Session expired', 'Please log in again.');
        return;
      }
      setReportErr(e?.message || "Couldn't generate the report.");
    } finally {
      setReportLoading(false);
    }
  };

  // Teacher page (reports.php) offers Daily/Weekly/Monthly/Student; the admin
  // page (admin_reports.php) has no weekly — so Weekly is teacher-only.
  // Teacher-wise is admin / principal / section-head only.
  const visibleModes = useMemo(
    () => MODES.filter((m) => (canSeeTeacherWise ? !m.teacherOnly : m.key !== 'teachers')),
    [canSeeTeacherWise]
  );

  // If the server flips the user's role mid-session, drop any mode that is
  // invalid for the new role (e.g. a teacher on 'weekly' who becomes admin —
  // admin_reports.php has no weekly type).
  useEffect(() => {
    if (canSeeTeacherWise && mode === 'weekly') setMode('daily');
  }, [canSeeTeacherWise, mode]);

  // NOTE: all hooks must stay above this early return (Rules of Hooks).
  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) => s.name.toLowerCase().includes(q) || s.roll.toLowerCase().includes(q)
    );
  }, [students, studentSearch]);

  if (!user) return <Redirect href="/(auth)/login" />;

  const selectedStudent = students.find((s) => s.id === studentId);

  return (
    <Screen>
      <AppBar />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Picker — full width, above the mode buttons */}
        <Card style={styles.pickerCard}>
          {mode === 'daily' || mode === 'weekly' ? (
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, LABEL_CAPS]}>
                {mode === 'weekly' ? 'Week Starting' : 'Date'}
              </Text>
              <Pressable
                style={[styles.input, styles.pickerInput]}
                onPress={() => openCal('date')}
              >
                <Ionicons name="calendar-outline" size={17} color={COLORS.primary} />
                <Text style={styles.pickerText}>{formatDateLong(date)}</Text>
                <Ionicons name="chevron-down" size={16} color={COLORS.textFaint} />
              </Pressable>
              {calOpen ? (
                <CalendarPopup
                  view={calView}
                  selectedISO={date}
                  onPick={pickCalDay}
                  onPrev={() =>
                    setCalView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))
                  }
                  onNext={() =>
                    setCalView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))
                  }
                />
              ) : null}
            </View>
          ) : null}

          {mode === 'monthly' ? (
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, LABEL_CAPS]}>Month</Text>
              <Pressable
                style={[styles.input, styles.pickerInput]}
                onPress={openMonths}
              >
                <Ionicons name="calendar-outline" size={17} color={COLORS.primary} />
                <Text style={styles.pickerText}>{formatMonthLong(month)}</Text>
                <Ionicons name="chevron-down" size={16} color={COLORS.textFaint} />
              </Pressable>
              {monthOpen ? (
                <MonthPopup
                  year={monthYear}
                  selectedYM={month}
                  onPick={pickMonth}
                  onPrev={() => setMonthYear((y) => y - 1)}
                  onNext={() => setMonthYear((y) => y + 1)}
                />
              ) : null}
            </View>
          ) : null}

          {mode === 'student' ? (
            <>
              {isAdmin ? (
                <View style={styles.field}>
                  <Text style={[styles.fieldLabel, LABEL_CAPS]}>
                    1. Class <Text style={styles.required}>*</Text>
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.classChipsScroll}
                    contentContainerStyle={styles.classChips}
                  >
                    {classes.map((c) => (
                      <Pressable
                        key={c}
                        style={[styles.classChip, className === c && styles.classChipOn]}
                        onPress={() => setClassName(c)}
                      >
                        <Text
                          style={[styles.classChipText, className === c && styles.classChipTextOn]}
                        >
                          {c}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  {!className ? (
                    <Text style={styles.hint}>Pick a class to load its students.</Text>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.field}>
                <Text style={[styles.fieldLabel, LABEL_CAPS]}>
                  {isAdmin ? '2. ' : ''}Student
                  {isAdmin ? ' *' : ''}
                </Text>
                <Pressable
                  style={[styles.input, styles.pickerInput]}
                  onPress={() => setStudentModal(true)}
                  disabled={isAdmin && !className}
                >
                  {reportLoading ? (
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  ) : selectedStudent ? (
                    <Text style={styles.pickerText}>
                      {selectedStudent.roll} — {selectedStudent.name}
                    </Text>
                  ) : (
                    <Text style={styles.pickerPlaceholder}>
                      {isAdmin && !className
                        ? 'Select a class first'
                        : students.length === 0
                        ? 'No students found'
                        : 'Select a student…'}
                    </Text>
                  )}
                  <Ionicons name="chevron-down" size={16} color={COLORS.textFaint} />
                </Pressable>
              </View>
            </>
          ) : null}

          {mode === 'teachers' ? (
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, LABEL_CAPS]}>Date Range</Text>
              <View style={styles.rangeRow}>
                <Pressable
                  style={[styles.input, styles.rangeInput, styles.pickerInput]}
                  onPress={() => openCal('from')}
                >
                  <Text style={styles.pickerText}>{formatDateShort(auditFrom)}</Text>
                  <Ionicons name="chevron-down" size={14} color={COLORS.textFaint} />
                </Pressable>
                <Text style={styles.rangeDash}>→</Text>
                <Pressable
                  style={[styles.input, styles.rangeInput, styles.pickerInput]}
                  onPress={() => openCal('to')}
                >
                  <Text style={styles.pickerText}>{formatDateShort(auditTo)}</Text>
                  <Ionicons name="chevron-down" size={14} color={COLORS.textFaint} />
                </Pressable>
              </View>
              {calOpen ? (
                <CalendarPopup
                  view={calView}
                  selectedISO={calTarget === 'from' ? auditFrom : auditTo}
                  onPick={pickCalDay}
                  onPrev={() =>
                    setCalView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))
                  }
                  onNext={() =>
                    setCalView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))
                  }
                />
              ) : null}
            </View>
          ) : null}
        </Card>

        {/* Mode chips */}
        <View style={styles.chips}>
          {visibleModes.map((m) => (
            <Pressable
              key={m.key}
              style={[styles.chip, mode === m.key && styles.chipOn]}
              onPress={() => pickMode(m.key)}
            >
              <Ionicons
                name={m.icon}
                size={15}
                color={mode === m.key ? '#fff' : COLORS.textMuted}
              />
              <Text style={[styles.chipText, mode === m.key && styles.chipTextOn]}>{m.label}</Text>
            </Pressable>
          ))}
        </View>

        <Card style={styles.filterCard}>
          {isAdmin && mode !== 'teachers' && mode !== 'student' ? (
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, LABEL_CAPS]}>Class</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.classChipsScroll}
                contentContainerStyle={styles.classChips}
              >
                <Pressable
                  style={[styles.classChip, !className && styles.classChipOn]}
                  onPress={() => setClassName('')}
                >
                  <Text style={[styles.classChipText, !className && styles.classChipTextOn]}>
                    All Classes
                  </Text>
                </Pressable>
                {classes.map((c) => (
                  <Pressable
                    key={c}
                    style={[styles.classChip, className === c && styles.classChipOn]}
                    onPress={() => setClassName(c)}
                  >
                    <Text style={[styles.classChipText, className === c && styles.classChipTextOn]}>
                      {c}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {mode === 'teachers' ? (
            <>
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, LABEL_CAPS]}>Class</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.classChipsScroll}
                  contentContainerStyle={styles.classChips}
                >
                  <Pressable
                    style={[styles.classChip, !className && styles.classChipOn]}
                    onPress={() => setClassName('')}
                  >
                    <Text style={[styles.classChipText, !className && styles.classChipTextOn]}>
                      All Classes
                    </Text>
                  </Pressable>
                  {(auditOptions?.classes.length ? auditOptions.classes : classes).map((c) => (
                    <Pressable
                      key={c}
                      style={[styles.classChip, className === c && styles.classChipOn]}
                      onPress={() => setClassName(c)}
                    >
                      <Text
                        style={[styles.classChipText, className === c && styles.classChipTextOn]}
                      >
                        {c}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, LABEL_CAPS]}>Teacher</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.classChipsScroll}
                  contentContainerStyle={styles.classChips}
                >
                  <Pressable
                    style={[styles.classChip, !auditTeacher && styles.classChipOn]}
                    onPress={() => setAuditTeacher('')}
                  >
                    <Text style={[styles.classChipText, !auditTeacher && styles.classChipTextOn]}>
                      All Teachers
                    </Text>
                  </Pressable>
                  {(auditOptions?.teachers || []).map((t) => (
                    <Pressable
                      key={t.username}
                      style={[styles.classChip, auditTeacher === t.username && styles.classChipOn]}
                      onPress={() => setAuditTeacher(t.username)}
                    >
                      <Text
                        style={[
                          styles.classChipText,
                          auditTeacher === t.username && styles.classChipTextOn,
                        ]}
                      >
                        {t.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, LABEL_CAPS]}>Type</Text>
                <View style={styles.chips}>
                  {[
                    { key: 'all', label: 'All Entries' },
                    { key: 'late', label: 'Late / Backdated' },
                    { key: 'on_time', label: 'On Time' },
                  ].map((t) => (
                    <Pressable
                      key={t.key}
                      style={[styles.chip, auditFilterType === t.key && styles.chipOn]}
                      onPress={() => setAuditFilterType(t.key)}
                    >
                      <Text
                        style={[styles.chipText, auditFilterType === t.key && styles.chipTextOn]}
                      >
                        {t.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </>
          ) : null}

          {reportErr ? <Text style={styles.err}>{reportErr}</Text> : null}

          <Pressable
            style={({ pressed }) => [
              styles.generate,
              pressed && styles.pressed,
              reportLoading && styles.busy,
            ]}
            onPress={generate}
            disabled={reportLoading}
          >
            {reportLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="download-outline" size={17} color="#fff" />
            )}
            <Text style={styles.generateText}>
              {reportLoading ? 'Generating…' : 'Generate Report'}
            </Text>
          </Pressable>
        </Card>

        {/* Native result */}
        {mode === 'teachers' && auditGenerated ? (
          <AuditResult records={auditRecords} from={auditFrom} to={auditTo} />
        ) : report ? (
          <ReportResultView result={report} />
        ) : reportLoading ? (
          <View style={styles.resultLoading}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.resultLoadingText}>Fetching report…</Text>
          </View>
        ) : (
          <View style={styles.resultEmpty}>
            <Ionicons name="analytics-outline" size={30} color={COLORS.textFaint} />
            <Text style={styles.resultEmptyText}>
              Set your filters and tap Generate Report.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Student picker modal */}
      <Modal visible={studentModal} transparent animationType="fade" onRequestClose={() => setStudentModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select Student</Text>
            <View style={styles.searchBar}>
              <Ionicons name="search-outline" size={16} color={COLORS.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={studentSearch}
                onChangeText={setStudentSearch}
                placeholder="Search by name or roll no…"
                placeholderTextColor={COLORS.textFaint}
                autoCorrect={false}
              />
            </View>
            <ScrollView style={styles.modalList}>
              {filteredStudents.length === 0 ? (
                <Text style={styles.modalEmpty}>No students match.</Text>
              ) : (
                filteredStudents.map((s) => (
                  <Pressable
                    key={s.id}
                    style={({ pressed }) => [styles.modalRow, pressed && styles.pressed]}
                    onPress={() => {
                      setStudentId(s.id);
                      setStudentModal(false);
                      setStudentSearch('');
                    }}
                  >
                    <View style={[styles.modalAvatar, s.id === studentId && styles.modalAvatarOn]}>
                      <Text style={[styles.modalAvatarText, s.id === studentId && styles.modalAvatarTextOn]}>
                        {s.roll}
                      </Text>
                    </View>
                    <Text style={styles.modalRowName} numberOfLines={1}>
                      {s.name}
                    </Text>
                    {s.id === studentId ? (
                      <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
                    ) : null}
                  </Pressable>
                ))
              )}
            </ScrollView>
            <Pressable style={styles.modalCancel} onPress={() => setStudentModal(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Native report result (daily / weekly / monthly / student-wise)
// ---------------------------------------------------------------------------

function ReportResultView({ result }: { result: ReportResult }) {
  const summary = useMemo(() => summarizeReport(result), [result]);
  // The student-wise report lists one student across many dates, so rows are
  // records, not students — label accordingly.
  const isPerStudent = useMemo(() => {
    const rolls = new Set(result.rows.map((r) => r.roll));
    return rolls.size === 1 && result.rows.length > 0;
  }, [result]);

  if (result.empty) {
    return (
      <Card style={styles.resultCard}>
        <Text style={styles.resultTitle} numberOfLines={1}>
          {result.title || 'Report'}
        </Text>
        <View style={styles.noRecords}>
          <Ionicons name="file-tray-outline" size={26} color={COLORS.textFaint} />
          <Text style={styles.noRecordsText}>No records for these filters.</Text>
        </View>
      </Card>
    );
  }

  return (
    <>
      <Card style={styles.resultCard}>
        <Text style={styles.resultTitle} numberOfLines={1}>
          {result.title || 'Report'}
        </Text>
        {summary.totalStudents > 0 ? (
          <View style={styles.summaryBars}>
            {summary.perCheckpoint.map((p) => {
              const pct = p.total ? Math.round((p.compliant / p.total) * 100) : 0;
              const color = pct >= 80 ? COLORS.compliant : pct >= 50 ? COLORS.warning : COLORS.danger;
              return (
                <View key={p.key} style={styles.summaryBarRow}>
                  <Text style={styles.summaryLabel}>{p.label}</Text>
                  <View style={styles.summaryTrack}>
                    <View style={[styles.summaryFill, { width: `${pct}%`, backgroundColor: color }]} />
                  </View>
                  <Text style={styles.summaryPct}>
                    {p.compliant}/{p.total} · {pct}%
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}
        <View style={styles.summaryFooter}>
          <View style={styles.summaryPill}>
            <Ionicons name="people-outline" size={14} color={COLORS.primary} />
            <Text style={styles.summaryPillText}>
              {summary.totalStudents} {isPerStudent ? 'records' : 'students'}
            </Text>
          </View>
          <View style={styles.summaryPill}>
            <Ionicons name="checkmark-done-outline" size={14} color={COLORS.compliant} />
            <Text style={styles.summaryPillText}>
              {summary.fullyCompliant}/{summary.totalStudents} fully compliant
            </Text>
          </View>
          {summary.absentCount > 0 ? (
            <View style={[styles.summaryPill, styles.summaryPillAbsent]}>
              <Ionicons name="close-circle-outline" size={14} color={COLORS.danger} />
              <Text style={[styles.summaryPillText, styles.summaryPillTextAbsent]}>
                {summary.absentCount} absent
              </Text>
            </View>
          ) : null}
        </View>
      </Card>

      {/* Legend — what the checks strip means */}
      <Card style={styles.legendCard}>
        <View style={styles.legendRow}>
          <Text style={[styles.legendMark, styles.checkOk]}>✓ OK</Text>
          <Text style={[styles.legendMark, styles.checkNo]}>✗ Issue</Text>
          <Text style={[styles.legendMark, styles.checkNone]}>– Not recorded</Text>
        </View>
        <Text style={styles.legendNote}>
          Strip order: {CHECKPOINTS.map((k) => CHECK_NAMES[k]).join(' · ')}
        </Text>
      </Card>

      {/* Records table */}
      <View style={styles.tableCard}>
        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.thDate]}>Date</Text>
          <Text style={[styles.th, styles.thRoll]}>Roll</Text>
          <Text style={[styles.th, styles.thName]}>Name</Text>
          <Text style={[styles.th, styles.thChecks]}>Checks</Text>
        </View>
        {result.rows.map((r, i) => (
          <View key={`${r.roll}-${i}`} style={[styles.tr, i % 2 === 1 && styles.trAlt]}>
            <Text style={[styles.td, styles.thDate]}>{r.date}</Text>
            <Text style={[styles.td, styles.thRoll]}>{r.roll}</Text>
            <View style={[styles.tdNameWrap, styles.thName]}>
              <Text style={styles.tdName} numberOfLines={1}>
                {r.name}
              </Text>
              <View style={styles.tdSubLine}>
                {r.absent ? (
                  <Text style={[styles.tdRemarks, styles.absentBadge]}>✗ Absent</Text>
                ) : null}
                {r.remarks ? (
                  <Text style={styles.tdRemarks} numberOfLines={1}>“{r.remarks}”</Text>
                ) : null}
              </View>
            </View>
            <View style={styles.checkStrip}>
              {CHECKPOINTS.map((k) => {
                const v = r.checkpoints[k];
                return (
                  <Text
                    key={k}
                    style={[
                      styles.stripMark,
                      v === '✓'
                        ? styles.checkOk
                        : v === '✗'
                        ? styles.checkNo
                        : styles.checkNone,
                    ]}
                  >
                    {v === '✓' ? '✓' : v === '✗' ? '✗' : '–'}
                  </Text>
                );
              })}
            </View>
          </View>
        ))}
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// Teacher-wise (admin): native audit result
// ---------------------------------------------------------------------------

function AuditResult({
  records,
  from,
  to,
}: {
  records: Awaited<ReturnType<typeof fetchAuditPage>>['records'];
  from: string;
  to: string;
}) {
  if (records.length === 0) {
    return (
      <Card style={styles.resultCard}>
        <Text style={styles.resultTitle} numberOfLines={1}>
          Teacher-wise · {from} → {to}
        </Text>
        <View style={styles.noRecords}>
          <Ionicons name="file-tray-outline" size={26} color={COLORS.textFaint} />
          <Text style={styles.noRecordsText}>No audit records for these filters.</Text>
        </View>
      </Card>
    );
  }
  const lateCount = records.filter(
    (r) => !/same day|on time/i.test(r.daysLate) && !/^0\b/.test(r.daysLate)
  ).length;

  return (
    <>
      <Card style={styles.resultCard}>
        <Text style={styles.resultTitle} numberOfLines={1}>
          Teacher-wise · {from} → {to}
        </Text>
        <View style={styles.summaryFooter}>
          <View style={styles.summaryPill}>
            <Ionicons name="list-outline" size={14} color={COLORS.primary} />
            <Text style={styles.summaryPillText}>{records.length} records</Text>
          </View>
          <View style={[styles.summaryPill, lateCount > 0 && styles.summaryPillLate]}>
            <Ionicons name="alert-circle-outline" size={14} color={lateCount > 0 ? COLORS.danger : COLORS.compliant} />
            <Text style={[styles.summaryPillText, lateCount > 0 && styles.summaryPillTextLate]}>
              {lateCount} late / backdated
            </Text>
          </View>
        </View>
      </Card>

      <View style={styles.tableCard}>
        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.thDateAudit]}>Date</Text>
          <Text style={[styles.th, styles.thRoll]}>Roll</Text>
          <Text style={[styles.th, styles.thName]}>Student</Text>
          <Text style={[styles.th, styles.thWho]}>By</Text>
          <Text style={[styles.th, styles.thLateAudit]}>Late</Text>
        </View>
        {records.map((r, i) => {
          const late = !/same day|on time/i.test(r.daysLate) && !/^0\b/.test(r.daysLate);
          return (
            <View key={`${r.roll}-${i}`} style={[styles.tr, i % 2 === 1 && styles.trAlt]}>
              <Text style={[styles.td, styles.thDateAudit]}>{r.date}</Text>
              <Text style={[styles.td, styles.thRoll]}>{r.roll}</Text>
              <View style={[styles.tdNameWrap, styles.thName]}>
                <Text style={styles.tdName} numberOfLines={1}>{r.student}</Text>
                <Text style={styles.tdRemarks} numberOfLines={1}>
                  {r.className} · {r.enteredBy}
                </Text>
              </View>
              <Text style={[styles.td, styles.thWho]} numberOfLines={1}>{r.enteredBy}</Text>
              <Text style={[styles.td, styles.thLateAudit, late ? styles.lateText : styles.onTimeText]}>
                {late ? r.daysLate : 'On time'}
              </Text>
            </View>
          );
        })}
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// Date calendar popup (daily / weekly / teacher-wise range)
// ---------------------------------------------------------------------------

function CalendarPopup({
  view,
  selectedISO,
  onPick,
  onPrev,
  onNext,
}: {
  view: { y: number; m: number };
  selectedISO: string;
  onPick: (day: number) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const firstWeekday = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const sel = parseISODate(selectedISO);
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return (
    <View style={styles.calPopup}>
      <View style={styles.calHead}>
        <Pressable onPress={onPrev} hitSlop={8} style={styles.calNav}>
          <Ionicons name="chevron-back" size={16} color={COLORS.textMuted} />
        </Pressable>
        <Text style={styles.calTitle}>
          {MONTHS_FULL[view.m]} {view.y}
        </Text>
        <Pressable onPress={onNext} hitSlop={8} style={styles.calNav}>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        </Pressable>
      </View>
      <View style={styles.calWeekRow}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => (
          <Text key={i} style={styles.calWeekday}>
            {w}
          </Text>
        ))}
      </View>
      <View style={styles.calGrid}>
        {cells.map((d, i) => {
          if (d === null) return <View key={`e${i}`} style={styles.calDay} />;
          const isSel = !!sel && sel.y === view.y && sel.m === view.m && sel.d === d;
          return (
            <Pressable
              key={d}
              onPress={() => onPick(d)}
              style={[styles.calDay, isSel && styles.calDaySel]}
            >
              <Text style={[styles.calDayText, isSel && styles.calDayTextSel]}>{d}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Months-only popup (monthly mode)
// ---------------------------------------------------------------------------

function MonthPopup({
  year,
  selectedYM,
  onPick,
  onPrev,
  onNext,
}: {
  year: number;
  selectedYM: string;
  onPick: (monthIndex: number) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const selMatch = /^(\d{4})-(\d{2})$/.exec(selectedYM);
  return (
    <View style={styles.calPopup}>
      <View style={styles.calHead}>
        <Pressable onPress={onPrev} hitSlop={8} style={styles.calNav}>
          <Ionicons name="chevron-back" size={16} color={COLORS.textMuted} />
        </Pressable>
        <Text style={styles.calTitle}>{year}</Text>
        <Pressable onPress={onNext} hitSlop={8} style={styles.calNav}>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        </Pressable>
      </View>
      <View style={styles.monthGrid}>
        {MONTHS_SHORT.map((m, i) => {
          const isSel =
            !!selMatch && Number(selMatch[1]) === year && Number(selMatch[2]) === i + 1;
          return (
            <Pressable
              key={m}
              onPress={() => onPick(i)}
              style={[styles.monthCell, isSel && styles.monthCellSel]}
            >
              <Text style={[styles.monthCellText, isSel && styles.monthCellTextSel]}>{m}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 32 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 14,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
  },
  chipOn: { backgroundColor: COLORS.primary },
  chipText: { fontSize: 12.5, fontFamily: FONT.regular, color: COLORS.textMuted },
  chipTextOn: { color: '#fff' },
  filterCard: { gap: SPACING.md, padding: 14, borderRadius: 20 },
  pickerCard: { gap: 12, padding: 14, borderRadius: 20 },
  // Calendar + months popups
  calPopup: { backgroundColor: COLORS.field, borderRadius: 14, padding: 10, marginTop: 8 },
  calHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  calNav: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calTitle: { flex: 1, textAlign: 'center', fontSize: 13.5, fontFamily: FONT.regular, color: COLORS.text },
  calWeekRow: { flexDirection: 'row' },
  calWeekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    fontFamily: FONT.medium,
    fontWeight: '600',
    color: COLORS.textFaint,
    paddingVertical: 4,
    letterSpacing: 0.5,
  },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calDay: {
    width: '14.28%',
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  calDaySel: { backgroundColor: COLORS.primary },
  calDayText: { fontSize: 13, fontFamily: FONT.regular, color: COLORS.text },
  calDayTextSel: { color: '#fff' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  monthCell: {
    width: '31%',
    height: 40,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthCellSel: { backgroundColor: COLORS.primary },
  monthCellText: { fontSize: 13, fontFamily: FONT.regular, color: COLORS.text },
  monthCellTextSel: { color: '#fff' },
  // Legend above the records table
  legendCard: { gap: 6, padding: 12 },
  legendRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  legendMark: { fontSize: 12.5, fontFamily: FONT.regular },
  legendNote: { fontSize: 11.5, fontFamily: FONT.regular, color: COLORS.textMuted },
  field: { gap: 6 },
  fieldLabel: { color: COLORS.textMuted },
  required: { color: COLORS.danger },
  input: {
    height: 52,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 14.5,
    color: COLORS.text,
    backgroundColor: COLORS.field,
    fontFamily: FONT.regular,
  },
  pickerInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerText: { color: COLORS.text, fontSize: 14, fontFamily: FONT.regular, flex: 1 },
  pickerPlaceholder: { color: COLORS.textFaint, fontSize: 14, fontFamily: FONT.regular, flex: 1 },
  classChips: { gap: 8, paddingVertical: 2 },
  classChipsScroll: { flexGrow: 0 },
  classChip: {
    height: 32,
    paddingHorizontal: 13,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  classChipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  classChipText: { fontSize: 12, fontFamily: FONT.regular, color: COLORS.textMuted },
  classChipTextOn: { color: '#fff' },
  hint: { fontSize: 11.5, color: COLORS.textMuted, fontFamily: FONT.regular, marginTop: 4 },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rangeInput: { flex: 1 },
  rangeDash: { color: COLORS.textFaint, fontSize: 14 },
  err: { fontSize: 12, color: COLORS.danger, fontFamily: FONT.regular },
  generate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 48,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    marginTop: 2,
  },
  generateText: { color: '#fff', fontSize: 14, fontFamily: FONT.medium, fontWeight: '600' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  busy: { opacity: 0.7 },
  // Result states
  resultLoading: { alignItems: 'center', gap: 10, paddingVertical: 48 },
  resultLoadingText: { fontSize: 13, color: COLORS.textMuted, fontFamily: FONT.regular },
  resultEmpty: { alignItems: 'center', gap: 10, paddingVertical: 48 },
  resultEmptyText: { fontSize: 13, color: COLORS.textMuted, fontFamily: FONT.regular },
  resultCard: { gap: 12, padding: 16 },
  resultTitle: { fontSize: 15, fontFamily: FONT.display, color: COLORS.text },
  noRecords: { alignItems: 'center', gap: 8, paddingVertical: 18 },
  noRecordsText: { fontSize: 13, color: COLORS.textMuted, fontFamily: FONT.regular },
  // Summary bars
  summaryBars: { gap: 8 },
  summaryBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryLabel: { width: 56, fontSize: 11.5, fontFamily: FONT.regular, color: COLORS.textMuted },
  summaryTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: COLORS.surfaceHigh, overflow: 'hidden' },
  summaryFill: { height: '100%', borderRadius: 4 },
  summaryPct: { width: 64, textAlign: 'right', fontSize: 11, fontFamily: FONT.regular, color: COLORS.text },
  summaryFooter: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  summaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceLow,
  },
  summaryPillLate: { backgroundColor: COLORS.dangerSoft },
  summaryPillAbsent: { backgroundColor: COLORS.dangerSoft },
  summaryPillText: { fontSize: 11.5, fontFamily: FONT.regular, color: COLORS.text },
  summaryPillTextLate: { color: COLORS.danger },
  summaryPillTextAbsent: { color: COLORS.danger },
  tdSubLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  absentBadge: { color: COLORS.danger, fontFamily: FONT.regular },
  // Records table
  tableCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    ...({ shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 12, elevation: 2 } as object),
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceLow,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outline,
  },
  th: { fontSize: 10, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.textFaint, letterSpacing: 0.8 },
  thDate: { width: 52 },
  thDateAudit: { width: 80 },
  thRoll: { width: 46 },
  thName: { flex: 1, minWidth: 90 },
  thChecks: { width: 112, textAlign: 'center' },
  thWho: { width: 64 },
  thLate: { width: 66, textAlign: 'right' },
  thLateAudit: { width: 80, textAlign: 'right' },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.outline,
  },
  trAlt: { backgroundColor: COLORS.surfaceLow },
  td: { fontSize: 12, fontFamily: FONT.regular, color: COLORS.text },
  tdNameWrap: { minWidth: 90 },
  tdName: { fontSize: 13.5, fontFamily: FONT.regular, color: COLORS.text },
  tdRemarks: { fontSize: 11, color: COLORS.textMuted, fontFamily: FONT.regular, marginTop: 1 },
  checkStrip: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: COLORS.field,
    borderRadius: 9,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  stripMark: { fontSize: 15, fontFamily: FONT.regular },
  checkOk: { color: COLORS.compliant },
  checkNo: { color: COLORS.danger },
  checkNone: { color: COLORS.textFaint },
  lateText: { color: COLORS.danger, fontFamily: FONT.regular, fontSize: 12 },
  onTimeText: { color: COLORS.compliant, fontFamily: FONT.regular, fontSize: 12 },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    alignSelf: 'stretch',
    maxHeight: '80%',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 20,
    gap: 12,
  },
  modalTitle: { fontSize: 18, fontFamily: FONT.display, color: COLORS.text },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    backgroundColor: COLORS.background,
  },
  searchInput: { flex: 1, fontSize: 13.5, color: COLORS.text, fontFamily: FONT.regular, height: '100%' },
  modalList: { flexGrow: 0 },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outline,
  },
  modalAvatar: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalAvatarOn: { backgroundColor: COLORS.primarySoft },
  modalAvatarText: { fontSize: 10, fontFamily: FONT.regular, color: COLORS.textMuted },
  modalAvatarTextOn: { color: COLORS.primaryDeep },
  modalRowName: { flex: 1, fontSize: 14, fontFamily: FONT.regular, color: COLORS.text },
  modalEmpty: { fontSize: 13, color: COLORS.textMuted, fontFamily: FONT.regular, paddingVertical: 16, textAlign: 'center' },
  modalCancel: {
    height: 44,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.outline,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  modalCancelText: { color: COLORS.text, fontSize: 14, fontFamily: FONT.regular },
});