import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, FONT, RADIUS } from '@/constants/theme';

export default function ClassPicker({
  value,
  onChange,
  classes,
  placeholder = 'Select class',
}: {
  value: string;
  onChange: (c: string) => void;
  classes: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);

  // No classes exist yet (e.g. adding the first student) — let the admin type a new one.
  if (classes.length === 0) {
    return (
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder="e.g. 6A"
        placeholderTextColor={COLORS.textFaint}
        autoCapitalize="characters"
        autoCorrect={false}
      />
    );
  }

  return (
    <>
      <Pressable style={styles.input} onPress={() => setOpen(true)}>
        <Text style={[styles.value, !value && styles.valuePlaceholder]}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={COLORS.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.title}>Select class</Text>
            <ScrollView style={styles.list} bounces={false}>
              {classes.map((c) => {
                const active = c === value;
                return (
                  <Pressable
                    key={c}
                    style={[styles.row, active && styles.rowActive]}
                    onPress={() => {
                      onChange(c);
                      setOpen(false);
                    }}
                  >
                    <Text style={[styles.rowText, active && styles.rowTextActive]}>
                      Class {c}
                    </Text>
                    {active ? <Ionicons name="checkmark" size={18} color={COLORS.primary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    backgroundColor: COLORS.background,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  value: { fontSize: 14, color: COLORS.text, fontFamily: FONT.regular },
  valuePlaceholder: { color: COLORS.textFaint },
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    paddingVertical: 8,
    maxHeight: '70%',
  },
  title: {
    fontSize: 14,
    fontFamily: FONT.medium,
    fontWeight: '600',
    color: COLORS.textMuted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
    paddingHorizontal: 16,
  },
  rowActive: { backgroundColor: COLORS.primarySoft },
  rowText: { fontSize: 15, color: COLORS.text, fontFamily: FONT.regular },
  rowTextActive: { color: COLORS.primary, fontFamily: FONT.medium, fontWeight: '600' },
});