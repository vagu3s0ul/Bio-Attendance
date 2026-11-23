import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import AdminOnly from '@/components/AdminOnly';
import Screen from '@/components/Screen';
import AppBar from '@/components/AppBar';
import ActionCard from '@/components/ActionCard';
import Card from '@/components/Card';
import { COLORS, FONT, LABEL_CAPS, RADIUS, SPACING } from '@/constants/theme';
import { bulkUploadStudents } from '@/services/api';
import { SessionExpiredError } from '@/types';

export default function ManageHub() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [flush, setFlush] = useState(false);

  const pickAndUpload = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'text/comma-separated-values',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/octet-stream',
        ],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      setUploading(true);
      const result = await bulkUploadStudents(
        {
          uri: asset.uri,
          name: asset.name || 'students.csv',
          type: asset.mimeType || 'text/csv',
        },
        { flush }
      );
      Alert.alert(result.ok ? 'Upload complete' : 'Upload issue', result.message, [
        { text: 'OK' },
      ]);
    } catch (e: any) {
      if (e instanceof SessionExpiredError) {
        Alert.alert('Session expired', 'Please log in again.');
        router.replace('/(auth)/login');
        return;
      }
      Alert.alert('Upload failed', e?.message || 'Could not upload the file.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <AdminOnly>
    <Screen edges={[]} style={styles.screen}>
      <AppBar />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.head}>
          <Text style={styles.title}>Teachers &amp; Students</Text>
          <Text style={styles.sub}>Add, edit or deactivate accounts and rosters.</Text>
        </View>

        <Text style={[styles.sec, LABEL_CAPS]}>Manage</Text>
        <View style={styles.actions}>
          <ActionCard
            icon="people-outline"
            title="Manage Students"
            subtitle="Search, filter by class, add or edit students"
            filled
            onPress={() => router.push('/manage/students')}
          />
          <ActionCard
            icon="person-circle-outline"
            title="Manage Teachers"
            subtitle="Add teachers and control their access & class"
            onPress={() => router.push('/manage/teachers')}
          />
        </View>

        <Text style={[styles.sec, LABEL_CAPS]}>Bulk Upload</Text>
        <Card style={styles.csvCard}>
          <View style={styles.csvIcon}>
            <Text style={styles.csvIconText}>XLSX</Text>
          </View>
          <View style={styles.csvText}>
            <Text style={styles.csvTitle}>Upload Students (Excel / CSV)</Text>
            <Text style={styles.csvBody}>
              Bulk-import many students at once. Columns: name, reg number, class, section, WhatsApp number.
            </Text>
          </View>
        </Card>
        <Pressable onPress={() => setFlush((v) => !v)} style={styles.flushRow}>
          <View style={[styles.checkbox, flush && styles.checkboxOn]}>
            {flush ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
          </View>
          <View style={styles.flushText2}>
            <Text style={styles.flushText}>Flush all existing students before import</Text>
            <Text style={styles.flushHint}>
              The uploaded file replaces the whole roster. Sections in the file (e.g. 5 + Red = 5R) are created automatically.
            </Text>
          </View>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.uploadBtn, pressed && styles.pressed, uploading && styles.busy]}
          onPress={pickAndUpload}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
          )}
          <Text style={styles.uploadText}>
            {uploading ? 'Uploading…' : 'Choose Excel / CSV & Upload'}
          </Text>
        </Pressable>
      </ScrollView>
    </Screen>
    </AdminOnly>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: SPACING.lg, paddingBottom: 40, gap: SPACING.lg },
  head: { gap: 2 },
  title: {
    fontSize: 21,
    fontFamily: FONT.display,
    fontWeight: '300',
    color: COLORS.text,
    letterSpacing: -0.4,
  },
  sub: { fontSize: 14, color: COLORS.textMuted, fontFamily: FONT.regular, marginTop: 2 },
  sec: { color: COLORS.textMuted, marginTop: 2 },
  actions: { gap: SPACING.md },
  csvCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  csvIcon: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.success + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  csvIconText: { fontSize: 10, fontWeight: '400', color: COLORS.compliant },
  csvText: { flex: 1 },
  csvTitle: { fontSize: 13.5, fontFamily: FONT.regular, fontWeight: '400', color: COLORS.text },
  csvBody: { fontSize: 12, color: COLORS.textMuted, marginTop: 2, fontFamily: FONT.regular },
  flushRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 6,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.outline,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  checkboxOn: { backgroundColor: COLORS.danger, borderColor: COLORS.danger },
  flushText: { fontSize: 13, color: COLORS.text, fontFamily: FONT.regular, fontWeight: '400' },
  flushText2: { flex: 1, gap: 2 },
  flushHint: { fontSize: 11.5, color: COLORS.textMuted, fontFamily: FONT.regular, lineHeight: 16 },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 46,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
  },
  uploadText: { color: '#fff', fontSize: 13.5, fontFamily: FONT.regular, fontWeight: '400' },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  busy: { opacity: 0.7 },
});
