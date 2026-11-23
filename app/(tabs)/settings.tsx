import React, { useCallback, useState } from 'react';
import {
  Alert,
  ImageBackground,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppBar from '@/components/AppBar';
import Card from '@/components/Card';
import StatCard from '@/components/StatCard';
import { COLORS, FONT, LABEL_CAPS, RADIUS, SPACING } from '@/constants/theme';
import { fetchProfile } from '@/services/api';
import {
  installedInfo,
  fetchUpdateInfo,
  isUpdateAvailable,
  downloadAndInstallUpdate,
  getPendingDownload,
  resumePendingDownload,
  type DownloadProgress,
} from '@/services/updates';
import { exportBackupFile, importBackupFile } from '@/services/backup';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useSession } from '@/store/session';
import { ProfileData, SessionExpiredError } from '@/types';

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return mb >= 1000 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

interface DownloadState {
  percent: number;
  label: string;
  phase: 'downloading' | 'installing';
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useSession();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [downloadState, setDownloadState] = useState<DownloadState | null>(null);
  const [lateInfoOpen, setLateInfoOpen] = useState(false);

  const load = useCallback(
    async (asRefresh = false) => {
      if (asRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        setProfile(await fetchProfile());
      } catch (e: any) {
        if (e instanceof SessionExpiredError) {
          Alert.alert('Session expired', 'Please log in again.');
          await signOut();
          router.replace('/(auth)/login');
          return;
        }
        // Keep last profile; show a silent notice on refresh only.
        if (!asRefresh && !profile) {
          Alert.alert("Couldn't load profile", e?.message || 'Check your connection.');
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [signOut, profile]
  );

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkUpdates = async () => {
    setBusyAction('update');
    try {
      const info = await fetchUpdateInfo();
      const installed = installedInfo();
      if (!info) {
        Alert.alert('No update info', 'Could not reach the update server. Try again later.');
        return;
      }
      if (!isUpdateAvailable(info, installed)) {
        Alert.alert('Up to date', `You are on the latest version (${installed.version}).`);
        return;
      }
      // A download started earlier may still be running in the background
      // (or already finished while the app was closed) — resume it instead
      // of starting over.
      const pending = await getPendingDownload();
      const hasPending = !!pending && pending.versionCode === info.versionCode;
      const onDownloadProgress = (p: DownloadProgress) => {
        const percent =
          p.fraction === null ? 0 : Math.min(100, Math.round(p.fraction * 100));
        setDownloadState({
          percent,
          label: p.totalBytes
            ? `${formatBytes(p.writtenBytes)} of ${formatBytes(p.totalBytes)}`
            : `${formatBytes(p.writtenBytes)} downloaded`,
          phase: percent >= 100 ? 'installing' : 'downloading',
        });
      };
      Alert.alert(
        'Update available',
        `${info.version} is available (you have ${installed.version}).${info.notes ? '\n\n' + info.notes : ''}${hasPending ? '\n\nA download for this version is already running in the background.' : ''}`,
        [
          { text: 'Later', style: 'cancel' },
          {
            text: hasPending ? 'Resume download' : 'Download & install',
            onPress: async () => {
              setBusyAction('download');
              setDownloadState({ percent: 0, label: 'Connecting to the server…', phase: 'downloading' });
              try {
                const result = hasPending
                  ? await resumePendingDownload(info, onDownloadProgress)
                  : await downloadAndInstallUpdate(info, onDownloadProgress);
                // resumePendingDownload returns 'none' when there is nothing
                // to resume after all — fall back to a fresh download.
                if (result === 'none') {
                  await downloadAndInstallUpdate(info, onDownloadProgress);
                }
                setDownloadState(null);
                Alert.alert(
                  'Update downloaded',
                  'The installer should now be open. Tap Install to finish updating. If asked, allow \"Install unknown apps\" for this app in Android settings.'
                );
              } catch (e: any) {
                setDownloadState(null);
                Alert.alert('Update failed', e?.message || 'Could not download or install the update.');
              } finally {
                setBusyAction(null);
              }
            },
          },
        ]
      );
    } finally {
      setBusyAction(null);
    }
  };

  const backupData = async () => {
    setBusyAction('backup');
    try {
      const uri = await exportBackupFile();
      // Let the user save it somewhere durable (Downloads) via SAF.
      if (FileSystem.StorageAccessFramework) {
        const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (perm.granted) {
          const created = await FileSystem.StorageAccessFramework.createFileAsync(
            perm.directoryUri,
            'bio-attendance-backup',
            'application/json'
          );
          const text = await FileSystem.readAsStringAsync(uri);
          await FileSystem.writeAsStringAsync(created, text);
          Alert.alert('Backup saved', 'Your on-device data has been saved. Keep this file to restore after a reinstall.');
          return;
        }
      }
      Alert.alert('Backup ready', `Backup saved to: ${uri}`);
    } catch (e: any) {
      Alert.alert('Backup failed', e?.message || 'Could not create backup.');
    } finally {
      setBusyAction(null);
    }
  };

  const restoreData = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.length) return;
      setBusyAction('restore');
      await importBackupFile(picked.assets[0].uri);
      Alert.alert('Restored', 'On-device data restored. Restart the app to apply.');
    } catch (e: any) {
      Alert.alert('Restore failed', e?.message || 'Could not restore backup.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleLogout = () => {
    Alert.alert('Log out?', 'You will need your credentials to sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  // Prefer the freshly-fetched profile role (reflects server-side role changes).
  const isAdmin = profile ? profile.role === 'admin' : user?.role === 'admin';
  const role = profile?.role || user?.role || 'teacher';
  const roleLabel =
    role === 'admin'
      ? 'Administrator'
      : role === 'accountant'
      ? 'Accountant'
      : role === 'principal'
      ? 'Principal'
      : role === 'section_head'
      ? 'Section Head'
      : 'Teacher';
  const name = profile?.name || user?.name || user?.username || 'User';
  const initial = name.charAt(0).toUpperCase();

  return (
    <ImageBackground
      source={require('../../assets/login-gradient.png')}
      style={styles.gradientRoot}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.safe} edges={[]}>
      <AppBar showBell={false} light />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={COLORS.primary} />
        }
      >
        {/* Profile header */}
        <View style={styles.profileCard}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>{initial}</Text>
          </View>
          <Text style={styles.profileName}>{name}</Text>
          <Text style={styles.profileRole}>
            {roleLabel} · Class {profile?.className || '—'}
          </Text>
          <Pressable
            style={({ pressed }) => [styles.logoutBtn, pressed && styles.pressedBtn]}
            onPress={handleLogout}
          >
            <Ionicons name="log-out-outline" size={16} color="#fff" />
            <Text style={styles.logoutText}>Log out</Text>
          </Pressable>
        </View>

        {/* Stats */}
        <View style={styles.statsGrid}>
          <View style={styles.statsRow}>
            <StatCard
              label="Assigned Class"
              value={profile?.className || '—'}
              valueColor="#fff"
              labelColor="rgba(255,255,255,0.65)"
              style={styles.statTranslucent}
              center
            />
            <Pressable
              style={styles.latePress}
              onPress={() => setLateInfoOpen((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={
                isAdmin ? 'Late / Backdated — what is this?' : 'Late Warnings — what is this?'
              }
            >
              <StatCard
                label={isAdmin ? 'Late / Backdated' : 'Late Warnings'}
                value={loading && !profile ? '—' : profile?.lateWarnings ?? 0}
                valueColor={(profile?.lateWarnings ?? 0) > 0 ? '#FCA5A5' : '#fff'}
                labelColor="rgba(255,255,255,0.65)"
                style={[styles.statTranslucent, lateInfoOpen && styles.statTranslucentActive]}
                center
              />
            </Pressable>
          </View>
          <View style={styles.statsRow}>
            {isAdmin ? (
              <StatCard
                label="Late Rate"
                value={profile ? `${Math.round(profile.lateRate)}%` : '—'}
                valueColor="#fff"
                labelColor="rgba(255,255,255,0.65)"
                style={styles.statTranslucent}
                center
              />
            ) : (
              <StatCard
                label="Deadline"
                value={profile?.deadline || '09:30 AM'}
                valueColor="#fff"
                labelColor="rgba(255,255,255,0.65)"
                style={styles.statTranslucent}
                center
              />
            )}
            <StatCard
              label="Account"
              value={roleLabel}
              valueColor="#fff"
              labelColor="rgba(255,255,255,0.65)"
              style={styles.statTranslucent}
              center
            />
          </View>
        </View>

        {lateInfoOpen ? (
          <Card style={styles.explainerCard}>
            <View style={styles.explainerHead}>
              <Ionicons name="time-outline" size={15} color="#FDE68A" />
              <Text style={styles.explainerTitle}>
                {isAdmin ? 'What is a late / backdated entry?' : 'What is a late warning?'}
              </Text>
              <Pressable
                onPress={() => setLateInfoOpen(false)}
                hitSlop={8}
                style={styles.explainerClose}
              >
                <Ionicons name="close" size={14} color="#FDE68A" />
              </Pressable>
            </View>
            <View style={styles.explainerRow}>
              <Ionicons name="time-outline" size={14} color="#FDE68A" />
              <Text style={styles.explainerText}>
                Marked after your deadline — {profile?.deadline || '09:30 AM'}, with 30 minutes
                grace. After that the entry counts as late.
              </Text>
            </View>
            <View style={styles.explainerRow}>
              <Ionicons name="calendar-outline" size={14} color="#FDE68A" />
              <Text style={styles.explainerText}>
                Entered for a past day — backdated entries count as late too.
              </Text>
            </View>
            <View style={styles.explainerRow}>
              <Ionicons name="eye-outline" size={14} color="#FDE68A" />
              <Text style={styles.explainerText}>
                {isAdmin
                  ? "You can see every teacher's warnings in the Teacher-wise report."
                  : 'Each warning is visible to the admin and stays on your record.'}
              </Text>
            </View>
            <Text style={styles.explainerTip}>
              {isAdmin
                ? 'Teachers keep this at zero by marking attendance before the deadline.'
                : 'Mark attendance before the deadline to keep this at zero.'}
            </Text>
          </Card>
        ) : null}

        <Card style={[styles.section, styles.sectionTranslucent]}>
          <Text style={[styles.sectionTitle, LABEL_CAPS]}>App updates</Text>
          <Pressable
            style={({ pressed }) => [styles.actionBtnPrimary, pressed && styles.pressedBtn]}
            onPress={checkUpdates}
            disabled={busyAction !== null}
          >
            <Ionicons name="cloud-download-outline" size={18} color={COLORS.primary} />
            <Text style={styles.actionBtnPrimaryText}>
              {busyAction === 'update' || busyAction === 'download'
                ? 'Working…'
                : 'Check for updates'}
            </Text>
          </Pressable>
          <Text style={styles.actionHint}>
            Updates come straight from the school server — no Play Store needed. Downloads keep
            going in the background, even with the screen locked.
          </Text>
        </Card>

        <Card style={[styles.section, styles.sectionTranslucent]}>
          <Text style={[styles.sectionTitle, LABEL_CAPS]}>Backup & restore</Text>
          <View style={styles.actionRow}>
            <Pressable
              style={({ pressed }) => [styles.actionBtn, pressed && styles.pressedBtn]}
              onPress={backupData}
              disabled={busyAction !== null}
            >
              <Ionicons name="save-outline" size={18} color={COLORS.primary} />
              <Text style={styles.actionText}>
                {busyAction === 'backup' ? 'Working…' : 'Backup data'}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.actionBtn, pressed && styles.pressedBtn]}
              onPress={restoreData}
              disabled={busyAction !== null}
            >
              <Ionicons name="refresh-outline" size={18} color={COLORS.primary} />
              <Text style={styles.actionText}>
                {busyAction === 'restore' ? 'Working…' : 'Restore data'}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.actionHint}>
            Keeps WhatsApp numbers, base URL and remembered username across reinstalls. Face data lives on the server.
          </Text>
        </Card>

        <Card style={[styles.section, styles.sectionTranslucent]}>
          <Text style={[styles.sectionTitle, LABEL_CAPS]}>About</Text>
          <Text style={styles.aboutText}>
            Bio Attendance — a dedicated Android app for the Sialkot Public School &amp; College
            "Daily Student Checking System". Native app talking to the school site's own
            JSON API.
          </Text>
          <Text style={styles.version}>
            Version {Application.nativeApplicationVersion || Constants.expoConfig?.version || '1.4.17'}
          </Text>
          <Text style={styles.aboutText}>
            Developed by SPCS IT Department (Ahmed Faran).
          </Text>
        </Card>
      </ScrollView>

      <Modal
        visible={downloadState !== null}
        transparent
        animationType="fade"
        onRequestClose={() => undefined}
      >
        <View style={styles.downloadOverlay}>
          <View style={styles.downloadCard}>
            <View style={styles.downloadIcon}>
              <Ionicons name="cloud-download-outline" size={26} color={COLORS.primary} />
            </View>
            <Text style={styles.downloadTitle}>
              {downloadState?.phase === 'installing' ? 'Opening installer…' : 'Downloading update'}
            </Text>
            <Text style={styles.downloadMeta}>{downloadState?.label ?? ''}</Text>
            <View
              style={styles.progressTrack}
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: downloadState?.percent ?? 0 }}
            >
              <View
                style={[styles.progressFill, { width: `${downloadState?.percent ?? 0}%` }]}
              />
            </View>
            <Text style={styles.downloadPercent}>{downloadState?.percent ?? 0}%</Text>
            <Text style={styles.downloadHint}>
              You can leave this screen or lock the phone — the download keeps going in the
              background and the installer will open when it is ready.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.downloadLeaveBtn, pressed && styles.pressedBtn]}
              onPress={() => setDownloadState(null)}
            >
              <Text style={styles.downloadLeaveText}>Leave it running</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: SPACING.lg, paddingTop: 0, paddingBottom: 40, gap: SPACING.lg },
  profileCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    gap: 4,
  },
  profileAvatar: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  profileAvatarText: {
    fontSize: 30,
    fontFamily: FONT.display,
    fontWeight: '300',
    color: '#fff',
  },
  profileName: {
    fontSize: 21,
    fontFamily: FONT.display,
    fontWeight: '300',
    color: '#fff',
    letterSpacing: -0.4,
  },
  profileRole: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontFamily: FONT.regular, textAlign: 'center' },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    minHeight: 48,
    paddingHorizontal: 24,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  logoutText: { color: '#fff', fontSize: 13.5, fontFamily: FONT.regular, fontWeight: '400' },
  statsGrid: { gap: SPACING.md },
  statsRow: { flexDirection: 'row', gap: SPACING.md },
  section: { gap: 10 },
  gradientRoot: { flex: 1 },
  safe: { flex: 1 },
  latePress: { flex: 1 },
  statTranslucent: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    shadowOpacity: 0,
    elevation: 0,
  },
  statTranslucentActive: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.75)',
  },
  sectionTranslucent: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    shadowOpacity: 0,
    elevation: 0,
  },
  explainerCard: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    shadowOpacity: 0,
    elevation: 0,
    gap: 10,
  },
  explainerHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  explainerTitle: { flex: 1, fontSize: 13.5, fontFamily: FONT.regular, color: '#fff' },
  explainerClose: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(253,230,138,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  explainerRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  explainerText: {
    flex: 1,
    fontSize: 13,
    fontFamily: FONT.regular,
    fontWeight: '300',
    lineHeight: 19,
    color: 'rgba(255,255,255,0.88)',
  },
  explainerTip: {
    fontSize: 12.5,
    fontFamily: FONT.regular,
    color: '#FDE68A',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
    paddingTop: 9,
  },
  sectionTitle: { color: 'rgba(255,255,255,0.65)' },
  aboutText: { fontSize: 13, color: '#fff', lineHeight: 19, fontFamily: FONT.regular },
  version: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4, fontFamily: FONT.regular },
  pressedBtn: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  actionRow: { flexDirection: 'row', gap: SPACING.md },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  actionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: RADIUS.full,
    backgroundColor: '#fff',
  },
  actionBtnPrimaryText: { fontSize: 13.5, fontFamily: FONT.regular, fontWeight: '400', color: COLORS.primary },
  actionText: { fontSize: 13, fontFamily: FONT.regular, fontWeight: '400', color: '#fff' },
  actionHint: { fontSize: 11.5, color: 'rgba(255,255,255,0.7)', fontFamily: FONT.regular, lineHeight: 16 },
  downloadOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  downloadCard: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    gap: 6,
  },
  downloadIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primarySoft ?? '#EFF6FF',
    marginBottom: 4,
  },
  downloadTitle: {
    fontSize: 17,
    fontFamily: FONT.display,
    fontWeight: '300',
    color: COLORS.text,
    textAlign: 'center',
  },
  downloadMeta: {
    fontSize: 12.5,
    color: COLORS.textMuted,
    fontFamily: FONT.regular,
    textAlign: 'center',
  },
  progressTrack: {
    width: '100%',
    height: 10,
    borderRadius: 999,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
    marginTop: 10,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  downloadPercent: {
    fontSize: 22,
    fontFamily: FONT.display,
    fontWeight: '300',
    color: COLORS.primary,
    marginTop: 6,
  },
  downloadHint: {
    fontSize: 11.5,
    color: COLORS.textMuted,
    fontFamily: FONT.regular,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 6,
  },
  downloadLeaveBtn: {
    marginTop: 12,
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadLeaveText: { fontSize: 13, fontFamily: FONT.regular, fontWeight: '400', color: COLORS.primary },
});
