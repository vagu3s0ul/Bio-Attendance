/**
 * Native Reports screen.
 *
 * Every filter mode fetches the real PHP report page (reports.php for
 * teachers — session-scoped to their class — and admin_reports.php for
 * admins) over the stored session cookie, PARSES the table, and renders it
 * natively below the filters. No browser/WebView is shown.
 *
 * Role rules (from the implementation spec + the live site):
 *  - Teacher: daily / weekly / monthly / student-wise, own class only. The
 *    student picker is pre-populated immediately with their class's students.
 *    (reports.php offers weekly; admin_reports.php does not.)
 *  - Admin: daily / monthly / student-wise + a Teacher-wise mode (audit.php —
 *    per-teacher completion/punctuality, rendered natively with its filters).
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
import { Ionicons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import Screen from '@/components/Screen';
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
} from '@/services/extract';
import { ReportStudent, SessionExpiredError } from '@/types';

type Mode = ReportType | 'teachers'; // 'teachers' = admin-only teacher-wise view

const MODES: { key: Mode; label: string; icon: keyof typeof Ionicons.glyphMap; teacherOnly?: boolean }[] = [
  { key: 'daily', label: 'Daily', icon: 'calendar-outline' },
  { key: 'weekly', label: 'Weekly', icon: 'calendar-outline', teacherOnly: true },
  { key: 'monthly', label: 'Monthly', icon: 'calendar-number-outline' },
  { key: 'student', label: 'Student-wise', icon: 'person-outline' },
  { key: 'teachers', label: 'Teacher-wise', icon: 'school-outline' },
];

const CHECK_LABELS: Record<string, string> = {
  uniform: 'U',
  shoes: 'Sh',
  socks: 'So',
  haircut: 'H',
  nails: 'N',
  bag: 'B',
};

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

  const [mode, setMode] = useState<Mode>('daily');
  const [date, setDate] = useState(todayISO());
  const [month, setMonth] = useState(currentMonth());

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

  // Admin: load the class list once.
  useEffect(() => {
    if (!isAdmin) return;
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
  }, [isAdmin]);

  // Admin: load the audit filter options (teacher-wise) once.
  useEffect(() => {
    if (!isAdmin) return;
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
  }, [isAdmin]);

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
    if (m !== 'student') setStudentId('');
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
  const visibleModes = useMemo(
    () => MODES.filter((m) => (isAdmin ? !m.teacherOnly : m.key !== 'teachers')),
    [isAdmin]
  );

  // If the server flips the user's role mid-session, drop any mode that is
  // invalid for the new role (e.g. a teacher on 'weekly' who becomes admin —
  // admin_reports.php has no weekly type).
  useEffect(() => {
    if (isAdmin && mode === 'weekly') setMode('daily');
  }, [isAdmin, mode]);

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
    <Screen edges={[]}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
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
          {mode === 'daily' || mode === 'weekly' ? (
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, LABEL_CAPS]}>
                {mode === 'weekly' ? 'Week Starting' : 'Date'}
              </Text>
              <TextInput
                style={styles.input}
                value={date}
                onChangeText={setDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={COLORS.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          ) : null}

          {mode === 'monthly' ? (
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, LABEL_CAPS]}>Month</Text>
              <TextInput
                style={styles.input}
                value={month}
                onChangeText={setMonth}
                placeholder="YYYY-MM"
                placeholderTextColor={COLORS.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          ) : null}

          {isAdmin && mode !== 'teachers' && mode !== 'student' ? (
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, LABEL_CAPS]}>Class</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
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
            <>
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, LABEL_CAPS]}>Date Range</Text>
                <View style={styles.rangeRow}>
                  <TextInput
                    style={[styles.input, styles.rangeInput]}
                    value={auditFrom}
                    onChangeText={setAuditFrom}
                    placeholder="From YYYY-MM-DD"
                    placeholderTextColor={COLORS.textFaint}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Text style={styles.rangeDash}>→</Text>
                  <TextInput
                    style={[styles.input, styles.rangeInput]}
                    value={auditTo}
                    onChangeText={setAuditTo}
                    placeholder="To YYYY-MM-DD"
                    placeholderTextColor={COLORS.textFaint}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, LABEL_CAPS]}>Class</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
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

      {/* Records table */}
      <View style={styles.tableCard}>
        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.thDate]}>Date</Text>
          <Text style={[styles.th, styles.thRoll]}>Roll</Text>
          <Text style={[styles.th, styles.thName]}>Name</Text>
          {CHECKPOINTS.map((k) => (
            <Text key={k} style={[styles.th, styles.thCheck]}>
              {CHECK_LABELS[k]}
            </Text>
          ))}
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
            {CHECKPOINTS.map((k) => {
              const v = r.checkpoints[k];
              return (
                <Text
                  key={k}
                  style={[
                    styles.tdCheck,
                    v === '✓'
                      ? styles.checkOk
                      : v === '✗'
                      ? styles.checkNo
                      : styles.checkNone,
                  ]}
                >
                  {v === '✓' ? '✓' : v === '✗' ? '✗' : '—'}
                </Text>
              );
            })}
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

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 32 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 13,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
  },
  chipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 12.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.textMuted },
  chipTextOn: { color: '#fff' },
  filterCard: { gap: SPACING.md, padding: 16 },
  field: { gap: 6 },
  fieldLabel: { color: COLORS.textMuted },
  required: { color: COLORS.danger },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: COLORS.background,
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
  classChip: {
    minHeight: 32,
    paddingHorizontal: 13,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  classChipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  classChipText: { fontSize: 12, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.textMuted },
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
    height: 46,
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
  resultTitle: { fontSize: 15, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  noRecords: { alignItems: 'center', gap: 8, paddingVertical: 18 },
  noRecordsText: { fontSize: 13, color: COLORS.textMuted, fontFamily: FONT.regular },
  // Summary bars
  summaryBars: { gap: 8 },
  summaryBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryLabel: { width: 56, fontSize: 11.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.textMuted },
  summaryTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: COLORS.surfaceHigh, overflow: 'hidden' },
  summaryFill: { height: '100%', borderRadius: 4 },
  summaryPct: { width: 64, textAlign: 'right', fontSize: 11, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
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
  summaryPillText: { fontSize: 11.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  summaryPillTextLate: { color: COLORS.danger },
  summaryPillTextAbsent: { color: COLORS.danger },
  tdSubLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  absentBadge: {
    color: COLORS.danger,
    fontFamily: FONT.medium,
    fontWeight: '600',
  },
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
  th: { fontSize: 10, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.textMuted, letterSpacing: 0.3 },
  thDate: { width: 52 },
  thDateAudit: { width: 80 },
  thRoll: { width: 46 },
  thName: { flex: 1, minWidth: 90 },
  thCheck: { width: 22, textAlign: 'center' },
  thWho: { width: 64 },
  thLate: { width: 66, textAlign: 'right' },
  thLateAudit: { width: 80, textAlign: 'right' },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.outline,
  },
  trAlt: { backgroundColor: COLORS.surfaceLow },
  td: { fontSize: 11.5, fontFamily: FONT.regular, color: COLORS.text },
  tdNameWrap: { minWidth: 90 },
  tdName: { fontSize: 12, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  tdRemarks: { fontSize: 10, color: COLORS.textMuted, fontFamily: FONT.regular, marginTop: 1 },
  tdCheck: { width: 22, textAlign: 'center', fontSize: 12, fontFamily: FONT.medium, fontWeight: '600' },
  checkOk: { color: COLORS.compliant },
  checkNo: { color: COLORS.danger },
  checkNone: { color: COLORS.textFaint },
  lateText: { color: COLORS.danger, fontFamily: FONT.medium, fontWeight: '600', fontSize: 10.5 },
  onTimeText: { color: COLORS.compliant, fontFamily: FONT.medium, fontWeight: '600', fontSize: 10.5 },
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
  modalTitle: { fontSize: 18, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
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
  modalAvatarText: { fontSize: 10, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.textMuted },
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
  modalCancelText: { color: COLORS.text, fontSize: 14, fontFamily: FONT.medium, fontWeight: '600' },
});
