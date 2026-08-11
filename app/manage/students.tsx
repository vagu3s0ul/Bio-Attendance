import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AdminOnly from '@/components/AdminOnly';
import Screen from '@/components/Screen';
import Card from '@/components/Card';
import { COLORS, FONT, LABEL_CAPS, RADIUS, SPACING } from '@/constants/theme';
import {
  addStudent,
  deleteStudent,
  editStudent,
  fetchManagePage,
} from '@/services/api';
import { ManagePage, ManageStudent, SessionExpiredError } from '@/types';
import { getWhatsappNumber, isValidNumber, normalizeNumber, setWhatsappNumber } from '@/services/whatsapp';

type StudentForm = { id?: number; className: string; rollno: string; name: string };

function StudentModal({
  visible,
  initial,
  onClose,
  onSaved,
}: {
  visible: boolean;
  initial: StudentForm | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [className, setClassName] = useState('');
  const [rollno, setRollno] = useState('');
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setClassName(initial?.className ?? '');
      setRollno(initial?.rollno ?? '');
      setName(initial?.name ?? '');
      setErr(null);
      // Prefill the on-device WhatsApp number when editing an existing student.
      if (initial?.className && initial?.rollno) {
        getWhatsappNumber(initial.className, initial.rollno).then(setWhatsapp);
      } else {
        setWhatsapp('');
      }
    }
  }, [visible, initial]);

  const save = async () => {
    if (!className.trim() || !rollno.trim() || !name.trim()) {
      setErr('Class, roll number and name are required.');
      return;
    }
    if (whatsapp.trim() && !isValidNumber(whatsapp)) {
      setErr('Enter a valid phone number, e.g. 0300 1234567 or +923001234567.');
      return;
    }
    setBusy(true);
    try {
      const res = initial?.id
        ? await editStudent({ id: String(initial.id), className: className.trim(), rollno: rollno.trim(), name: name.trim() })
        : await addStudent({ className: className.trim(), rollno: rollno.trim(), name: name.trim() });
      if (res.ok) {
        // Persist the number on-device (site has no column for it yet).
        if (whatsapp.trim()) {
          await setWhatsappNumber(className.trim(), rollno.trim(), whatsapp);
        }
        onClose();
        onSaved();
      } else {
        setErr(res.message);
      }
    } catch (e: any) {
      if (e instanceof SessionExpiredError) {
        onClose();
        onSaved(); // parent navigates to login on next fetch
      } else {
        setErr(e?.message || 'Could not save the student.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{initial?.id ? 'Edit Student' : 'Add New Student'}</Text>
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, LABEL_CAPS]}>Class</Text>
            <TextInput
              style={styles.input}
              value={className}
              onChangeText={setClassName}
              placeholder="e.g. 6A"
              placeholderTextColor={COLORS.textFaint}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, LABEL_CAPS]}>Roll No</Text>
            <TextInput
              style={styles.input}
              value={rollno}
              onChangeText={setRollno}
              placeholder="e.g. 12"
              placeholderTextColor={COLORS.textFaint}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, LABEL_CAPS]}>Student Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Muhammad Hassan"
              placeholderTextColor={COLORS.textFaint}
            />
          </View>
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, LABEL_CAPS]}>WhatsApp Number (optional)</Text>
            <TextInput
              style={styles.input}
              value={whatsapp}
              onChangeText={setWhatsapp}
              placeholder="0300 1234567"
              placeholderTextColor={COLORS.textFaint}
              keyboardType="phone-pad"
              autoCorrect={false}
            />
            <Text style={styles.waHint}>Stored on this device — used for parent alerts.</Text>
          </View>
          {err ? <Text style={styles.err}>{err}</Text> : null}
          <View style={styles.modalActions}>
            <Pressable style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.saveBtn, pressed && styles.pressed, busy && styles.busy]}
              onPress={save}
              disabled={busy}
            >
              {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Save</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function ManageStudents() {
  const router = useRouter();
  const [data, setData] = useState<ManagePage | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; initial: StudentForm | null }>({ open: false, initial: null });

  const load = useCallback(
    async (p: number, s: string, f: string) => {
      setLoading(true);
      try {
        const res = await fetchManagePage({ search: s || undefined, filterClass: f || undefined, page: p });
        setData(res);
      } catch (e: any) {
        if (e instanceof SessionExpiredError) {
          Alert.alert('Session expired', 'Please log in again.');
          router.replace('/(auth)/login');
          return;
        }
        Alert.alert("Couldn't load students", e?.message || 'Check your connection.');
      } finally {
        setLoading(false);
      }
    },
    [router]
  );

  useEffect(() => {
    load(page, search, filterClass);
  }, [page, search, filterClass, load]);

  const refresh = () => load(page, search, filterClass);

  const confirmDelete = (s: ManageStudent) => {
    Alert.alert('Deactivate student?', `${s.name} (${s.className} · ${s.roll})`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Deactivate',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await deleteStudent(s.id);
            Alert.alert(res.ok ? 'Done' : 'Not done', res.message);
            refresh();
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not delete.');
          }
        },
      },
    ]);
  };

  const classes = data?.classes || [];
  const total = data?.totalStudents || 0;
  const totalPages = data?.totalPages || 1;

  return (
    <AdminOnly>
    <Screen edges={[]}>
      {/* Search */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={searchInput}
            onChangeText={setSearchInput}
            onSubmitEditing={() => {
              setSearch(searchInput.trim());
              setPage(1);
            }}
            placeholder="Search by name or roll number..."
            placeholderTextColor={COLORS.textFaint}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchInput.length > 0 ? (
            <Pressable onPress={() => { setSearchInput(''); setSearch(''); setPage(1); }} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={COLORS.textFaint} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Class chips */}
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Pressable
            style={[styles.chip, !filterClass && styles.chipOn]}
            onPress={() => { setFilterClass(''); setPage(1); }}
          >
            <Text style={[styles.chipText, !filterClass && styles.chipTextOn]}>All Classes</Text>
          </Pressable>
          {classes.map((c) => (
            <Pressable
              key={c}
              style={[styles.chip, filterClass === c && styles.chipOn]}
              onPress={() => { setFilterClass(c); setPage(1); }}
            >
              <Text style={[styles.chipText, filterClass === c && styles.chipTextOn]}>Class {c}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Add button */}
      <View style={styles.addWrap}>
        <Pressable
          style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
          onPress={() => setModal({ open: true, initial: null })}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addText}>ADD NEW STUDENT</Text>
        </Pressable>
      </View>

      {/* List */}
      {loading && !data ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : data && data.students.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={30} color={COLORS.textMuted} />
          <Text style={styles.empty}>No students match{search ? ' your search' : ''}.</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
          <Text style={[styles.count, LABEL_CAPS]}>
            {data ? `Showing ${data.students.length} of ${total}` : ' '}
          </Text>
          {data?.students.map((s) => (
            <Card key={s.id} style={styles.studentCard}>
              <View style={styles.studentInfo}>
                <Text style={styles.studentMeta}>#{s.roll} • CLASS {s.className}</Text>
                <Text style={styles.studentName} numberOfLines={1}>{s.name}</Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
                onPress={() => setModal({ open: true, initial: { id: s.id, className: s.className, rollno: s.roll, name: s.name } })}
                hitSlop={6}
              >
                <Ionicons name="create-outline" size={18} color={COLORS.textMuted} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
                onPress={() => confirmDelete(s)}
                hitSlop={6}
              >
                <Ionicons name="trash-outline" size={17} color={COLORS.danger} />
              </Pressable>
            </Card>
          ))}

          {/* Pagination */}
          <View style={styles.pager}>
            <Pressable
              style={[styles.pageBtn, page <= 1 && styles.pageBtnDisabled]}
              disabled={page <= 1}
              onPress={() => setPage((p) => Math.max(1, p - 1))}
            >
              <Ionicons name="chevron-back" size={18} color={page <= 1 ? COLORS.textFaint : COLORS.primary} />
            </Pressable>
            <Text style={styles.pageText}>
              Page {data?.page || 1} of {totalPages}
            </Text>
            <Pressable
              style={[styles.pageBtn, page >= totalPages && styles.pageBtnDisabled]}
              disabled={page >= totalPages}
              onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <Ionicons name="chevron-forward" size={18} color={page >= totalPages ? COLORS.textFaint : COLORS.primary} />
            </Pressable>
          </View>
        </ScrollView>
      )}

      <StudentModal
        visible={modal.open}
        initial={modal.initial}
        onClose={() => setModal({ open: false, initial: null })}
        onSaved={() => {
          setModal({ open: false, initial: null });
          refresh();
        }}
      />
    </Screen>
    </AdminOnly>
  );
}

const styles = StyleSheet.create({
  searchWrap: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    backgroundColor: COLORS.surface,
  },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.text, fontFamily: FONT.regular, height: '100%' },
  chips: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, gap: 8 },
  chip: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 12.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.textMuted },
  chipTextOn: { color: '#fff' },
  addWrap: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
  },
  addText: { color: '#fff', fontSize: 13, fontFamily: FONT.medium, fontWeight: '600', letterSpacing: 0.4 },
  scroll: { flex: 1 },
  list: { paddingHorizontal: SPACING.lg, gap: SPACING.md, paddingBottom: 32 },
  count: { color: COLORS.textMuted, marginTop: 2 },
  studentCard: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 },
  studentInfo: { flex: 1 },
  studentMeta: {
    fontSize: 11.5,
    fontFamily: FONT.medium,
    fontWeight: '600',
    letterSpacing: 0.4,
    color: COLORS.textMuted,
  },
  studentName: { fontSize: 17, fontFamily: FONT.regular, fontWeight: '400', color: COLORS.text, marginTop: 2 },
  iconBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 8 },
  pageBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  pageBtnDisabled: { opacity: 0.4 },
  pageText: { fontSize: 13, color: COLORS.textMuted, fontFamily: FONT.medium, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  empty: { fontSize: 13, color: COLORS.textMuted, fontFamily: FONT.regular },
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
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 20,
    gap: 12,
  },
  modalTitle: { fontSize: 18, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  field: { gap: 6 },
  fieldLabel: { color: COLORS.textMuted },
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
  waHint: { fontSize: 11.5, color: COLORS.textFaint, fontFamily: FONT.regular },
  err: { fontSize: 12, color: COLORS.danger, fontFamily: FONT.regular },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { color: COLORS.text, fontSize: 14, fontFamily: FONT.medium, fontWeight: '600' },
  saveBtn: {
    flex: 1,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { color: '#fff', fontSize: 14, fontFamily: FONT.medium, fontWeight: '600' },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  busy: { opacity: 0.7 },
});
