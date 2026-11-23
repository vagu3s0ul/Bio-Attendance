/**
 * Shared "WhatsApp number" editor used wherever a student's number can be
 * added/edited: the admin Manage Students form, the teacher's Daily Entry
 * student cards, and the Notify Parents "no number on file" shortcut.
 * Numbers are normalized to E.164-ish form and saved to the school server
 * (students.whatsapp — see services/whatsapp.ts), so every teacher and the
 * office see the same number. When the server can't be reached the number is
 * kept on this device only and synced automatically later.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, FONT, LABEL_CAPS, RADIUS, SPACING } from '@/constants/theme';
import { getWhatsappNumber, isValidNumber, normalizeNumber, setWhatsappNumber } from '@/services/whatsapp';

export default function WhatsAppNumberModal({
  visible,
  className,
  roll,
  studentName,
  onClose,
  onSaved,
}: {
  visible: boolean;
  className: string;
  roll: string;
  studentName: string;
  onClose: () => void;
  onSaved?: (number: string) => void;
}) {
  const [number, setNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savedLocalOnly, setSavedLocalOnly] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setErr(null);
    setNotice(null);
    setSavedLocalOnly(false);
    setLoading(true);
    getWhatsappNumber(className, roll)
      .then((n) => setNumber(n))
      .finally(() => setLoading(false));
  }, [visible, className, roll]);

  const save = async () => {
    if (savedLocalOnly) {
      onClose();
      return;
    }
    const normalized = normalizeNumber(number);
    if (!isValidNumber(number)) {
      setErr('Enter a valid phone number, e.g. 0300 1234567 or +923001234567.');
      return;
    }
    setBusy(true);
    try {
      const res = await setWhatsappNumber(className, roll, normalized);
      if (res.savedToServer) {
        onClose();
        onSaved?.(normalized);
      } else {
        setNotice(
          'Saved on this device only — the server could not be reached. It will sync automatically when you are back online.'
        );
        setSavedLocalOnly(true);
      }
    } catch (e: any) {
      setErr(e?.message || 'Could not save the number.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          <View style={styles.iconRow}>
            <View style={styles.icon}>
              <Ionicons name="logo-whatsapp" size={22} color={COLORS.compliant} />
            </View>
            <Text style={styles.title}>WhatsApp Number</Text>
          </View>
          <Text style={styles.sub}>
            {studentName} · {className} (Roll {roll}) — used for the parent alert after a
            non-compliant daily entry.
          </Text>
          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : (
            <>
              <Text style={[styles.fieldLabel, LABEL_CAPS]}>Phone Number</Text>
              <TextInput
                style={styles.input}
                value={number}
                onChangeText={setNumber}
                placeholder="0300 1234567"
                placeholderTextColor={COLORS.textFaint}
                keyboardType="phone-pad"
                autoCorrect={false}
              />
              <Text style={styles.hint}>
                Saved to the school server — every teacher and the office will see the new number.
              </Text>
              {notice ? <Text style={styles.notice}>{notice}</Text> : null}
              {err ? <Text style={styles.err}>{err}</Text> : null}
            </>
          )}
          <View style={styles.actions}>
            <Pressable style={styles.cancel} onPress={onClose} disabled={loading}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.save, pressed && styles.pressed, (busy || loading) && styles.busy]}
              onPress={save}
              disabled={busy || loading}
            >
              {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>{savedLocalOnly ? 'Done' : 'Save Number'}</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    alignSelf: 'stretch',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 20,
    gap: 10,
  },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: '#E9F7EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  sub: { fontSize: 13, color: COLORS.textMuted, fontFamily: FONT.regular, lineHeight: 19 },
  loading: { minHeight: 60, alignItems: 'center', justifyContent: 'center' },
  fieldLabel: { color: COLORS.textMuted, marginTop: 4 },
  input: {
    height: 46,
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.background,
    fontFamily: FONT.regular,
  },
  hint: { fontSize: 11.5, color: COLORS.textFaint, fontFamily: FONT.regular, lineHeight: 16 },
  notice: { fontSize: 12, color: COLORS.warningText, fontFamily: FONT.regular, lineHeight: 17 },
  err: { fontSize: 12, color: COLORS.danger, fontFamily: FONT.regular },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancel: {
    flex: 1,
    height: 44,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { color: COLORS.text, fontSize: 14, fontFamily: FONT.medium, fontWeight: '600' },
  save: {
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
