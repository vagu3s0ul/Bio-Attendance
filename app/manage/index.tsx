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
import { Ionicons } from '@expo/vector-icons';
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

  const pickAndUpload = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      setUploading(true);
      const result = await bulkUploadStudents({
        uri: asset.uri,
        name: asset.name || 'students.csv',
        type: asset.mimeType || 'text/csv',
      });
      Alert.alert(result.ok ? 'Upload complete' : 'Upload issue', result.message, [
        { text: 'OK' },
      ]);
    } catch (e: any) {
      if (e instanceof SessionExpiredError) {
        Alert.alert('Session expired', 'Please log in again.');
        router.replace('/(auth)/login');
        return;
      }
      Alert.alert('Upload failed', e?.message || 'Could not upload the CSV file.');
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
            <Text style={styles.csvIconText}>CSV</Text>
          </View>
          <View style={styles.csvText}>
            <Text style={styles.csvTitle}>Upload Students (CSV)</Text>
            <Text style={styles.csvBody}>
              Bulk-import many students at once. Format: class, rollno, name.
            </Text>
          </View>
        </Card>
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
            {uploading ? 'Uploading…' : 'Choose CSV & Upload'}
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
    fontFamily: FONT.bold,
    fontWeight: '700',
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
  csvIconText: { fontSize: 10, fontWeight: '700', color: COLORS.compliant },
  csvText: { flex: 1 },
  csvTitle: { fontSize: 14, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  csvBody: { fontSize: 12, color: COLORS.textMuted, marginTop: 2, fontFamily: FONT.regular },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 46,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
  },
  uploadText: { color: '#fff', fontSize: 14, fontFamily: FONT.medium, fontWeight: '600' },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  busy: { opacity: 0.7 },
});
