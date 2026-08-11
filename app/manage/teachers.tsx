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
import { addTeacher, deleteTeacher, fetchManagePage } from '@/services/api';
import { ManagePage, ManageTeacher, SessionExpiredError } from '@/types';

function TeacherModal({
  visible,
  classes,
  onClose,
  onSaved,
}: {
  visible: boolean;
  classes: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [className, setClassName] = useState('');
  const [role, setRole] = useState<'teacher' | 'admin'>('teacher');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setUsername('');
      setPassword('');
      setName('');
      setClassName(classes[0] || '');
      setRole('teacher');
      setErr(null);
    }
  }, [visible, classes]);

  const save = async () => {
    if (!username.trim() || !password.trim() || !name.trim() || !className.trim()) {
      setErr('Username, password, name and class are required.');
      return;
    }
    setBusy(true);
    try {
      const res = await addTeacher({
        username: username.trim(),
        password,
        name: name.trim(),
        className: className.trim(),
        role,
      });
      if (res.ok) {
        onClose();
        onSaved();
      } else {
        setErr(res.message);
      }
    } catch (e: any) {
      if (e instanceof SessionExpiredError) {
        onClose();
        onSaved();
      } else {
        setErr(e?.message || 'Could not add the teacher.');
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
        <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add New Teacher</Text>
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, LABEL_CAPS]}>Username</Text>
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder="e.g. ali123"
                placeholderTextColor={COLORS.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, LABEL_CAPS]}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="e.g. pass123"
                placeholderTextColor={COLORS.textFaint}
                secureTextEntry
              />
            </View>
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, LABEL_CAPS]}>Full Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Ali Ahmad"
                placeholderTextColor={COLORS.textFaint}
              />
            </View>
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
              <Text style={[styles.fieldLabel, LABEL_CAPS]}>Role</Text>
              <View style={styles.roleRow}>
                <Pressable
                  style={[styles.roleChip, role === 'teacher' && styles.roleChipOn]}
                  onPress={() => setRole('teacher')}
                >
                  <Text style={[styles.roleText, role === 'teacher' && styles.roleTextOn]}>Teacher</Text>
                </Pressable>
                <Pressable
                  style={[styles.roleChip, role === 'admin' && styles.roleChipOn]}
                  onPress={() => setRole('admin')}
                >
                  <Text style={[styles.roleText, role === 'admin' && styles.roleTextOn]}>Admin</Text>
                </Pressable>
              </View>
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
                {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Add Teacher</Text>}
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function ManageTeachers() {
  const router = useRouter();
  const [data, setData] = useState<ManagePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchManagePage());
    } catch (e: any) {
      if (e instanceof SessionExpiredError) {
        Alert.alert('Session expired', 'Please log in again.');
        router.replace('/(auth)/login');
        return;
      }
      Alert.alert("Couldn't load teachers", e?.message || 'Check your connection.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const confirmDelete = (t: ManageTeacher) => {
    Alert.alert('Deactivate teacher?', `${t.name} (${t.username})`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Deactivate',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await deleteTeacher(t.id);
            Alert.alert(res.ok ? 'Done' : 'Not done', res.message);
            load();
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not delete.');
          }
        },
      },
    ]);
  };

  return (
    <AdminOnly>
    <Screen edges={[]}>
      <View style={styles.addWrap}>
        <Pressable
          style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
          onPress={() => setModalOpen(true)}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addText}>ADD TEACHER</Text>
        </Pressable>
      </View>

      {loading && !data ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : data && data.teachers.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="person-circle-outline" size={30} color={COLORS.textMuted} />
          <Text style={styles.empty}>No teachers found.</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
          <Text style={[styles.count, LABEL_CAPS]}>
            {data ? `${data.teachers.length} teachers` : ' '}
          </Text>
          {data?.teachers.map((t) => {
            const isAdminRole = t.role === 'admin';
            return (
              <Card key={t.id} style={styles.teacherCard}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{t.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.teacherInfo}>
                  <View style={styles.nameRow}>
                    <Text style={styles.teacherName} numberOfLines={1}>{t.name}</Text>
                    <View style={[styles.roleBadge, isAdminRole && styles.roleBadgeAdmin]}>
                      <Text style={[styles.roleBadgeText, isAdminRole && styles.roleBadgeTextAdmin]}>
                        {isAdminRole ? 'ADMIN' : 'TEACHER'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.teacherSub}>
                    Class {t.className === 'ALL' ? 'All Classes' : t.className} · @{t.username}
                  </Text>
                </View>
                <Pressable
                  style={({ pressed }) => [styles.moreBtn, pressed && styles.pressed]}
                  onPress={() => confirmDelete(t)}
                  hitSlop={8}
                >
                  <Ionicons name="trash-outline" size={17} color={COLORS.danger} />
                </Pressable>
              </Card>
            );
          })}
        </ScrollView>
      )}

      <TeacherModal
        visible={modalOpen}
        classes={data?.classes || []}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          load();
        }}
      />
    </Screen>
    </AdminOnly>
  );
}

const styles = StyleSheet.create({
  addWrap: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
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
  teacherCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 17, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.primary },
  teacherInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  teacherName: { fontSize: 15, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text, flexShrink: 1 },
  roleBadge: { backgroundColor: COLORS.surfaceHigh, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  roleBadgeAdmin: { backgroundColor: COLORS.primarySoft },
  roleBadgeText: { fontSize: 9.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.textMuted, letterSpacing: 0.4 },
  roleBadgeTextAdmin: { color: COLORS.primary },
  teacherSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2, fontFamily: FONT.regular },
  moreBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  empty: { fontSize: 13, color: COLORS.textMuted, fontFamily: FONT.regular },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    padding: 24,
  },
  modalScroll: { flexGrow: 1, justifyContent: 'center' },
  modalCard: {
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
  roleRow: { flexDirection: 'row', gap: 8 },
  roleChip: {
    flex: 1,
    height: 40,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleChipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  roleText: { fontSize: 13, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.textMuted },
  roleTextOn: { color: '#fff' },
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
