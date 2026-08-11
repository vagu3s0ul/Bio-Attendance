import React, { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Screen from '@/components/Screen';
import Card from '@/components/Card';
import StatCard from '@/components/StatCard';
import { COLORS, FONT, LABEL_CAPS, RADIUS, SPACING } from '@/constants/theme';
import { fetchProfile } from '@/services/api';
import { useSession } from '@/store/session';
import { ProfileData, SessionExpiredError } from '@/types';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useSession();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
  const name = profile?.name || user?.name || user?.username || 'User';
  const initial = name.charAt(0).toUpperCase();

  return (
    <Screen edges={[]}>
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
            {isAdmin ? 'Administrator' : 'Teacher'} · Class {profile?.className || '—'}
          </Text>
          <Pressable
            style={({ pressed }) => [styles.logoutBtn, pressed && styles.pressedBtn]}
            onPress={handleLogout}
          >
            <Ionicons name="log-out-outline" size={16} color={COLORS.danger} />
            <Text style={styles.logoutText}>Log out</Text>
          </Pressable>
        </View>

        {/* Stats */}
        <View style={styles.statsGrid}>
          <StatCard label="Assigned Class" value={profile?.className || '—'} />
          <StatCard
            label={isAdmin ? 'Late / Backdated' : 'Late Warnings'}
            value={loading && !profile ? '—' : profile?.lateWarnings ?? 0}
            valueColor={(profile?.lateWarnings ?? 0) > 0 ? COLORS.danger : COLORS.text}
            accent={(profile?.lateWarnings ?? 0) > 0}
          />
          {isAdmin ? (
            <StatCard label="Late Rate" value={profile ? `${Math.round(profile.lateRate)}%` : '—'} />
          ) : (
            <StatCard label="Deadline" value={profile?.deadline || '09:30 AM'} />
          )}
          <StatCard label="Account" value={isAdmin ? 'Admin' : 'Teacher'} />
        </View>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, LABEL_CAPS]}>About</Text>
          <Text style={styles.aboutText}>
            SPS Attendance — a dedicated Android app for the Sialkot Public School &amp; College
            "Daily Student Checking System". Native shell with the school's web pages embedded for
            full fidelity.
          </Text>
          <Text style={styles.version}>Version 1.0.0</Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: SPACING.lg, paddingBottom: 40, gap: SPACING.lg },
  profileCard: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    gap: 4,
  },
  profileAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  profileAvatarText: {
    fontSize: 28,
    fontFamily: FONT.medium,
    fontWeight: '600',
    color: COLORS.primary,
  },
  profileName: { fontSize: 20, fontFamily: FONT.regular, fontWeight: '400', color: COLORS.text },
  profileRole: { fontSize: 13, color: COLORS.textMuted, fontFamily: FONT.regular, textAlign: 'center' },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    minHeight: 44,
    paddingHorizontal: 24,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.danger,
    backgroundColor: COLORS.surface,
  },
  logoutText: { color: COLORS.danger, fontSize: 14, fontFamily: FONT.medium, fontWeight: '600' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md },
  section: { gap: 10 },
  sectionTitle: { color: COLORS.textMuted },
  aboutText: { fontSize: 13, color: COLORS.text, lineHeight: 19, fontFamily: FONT.regular },
  version: { fontSize: 12, color: COLORS.textMuted, marginTop: 4, fontFamily: FONT.regular },
  pressedBtn: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
