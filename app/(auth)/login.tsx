import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import Screen from '@/components/Screen';
import { COLORS, FONT, RADIUS, SHADOW, SPACING } from '@/constants/theme';
import { login } from '@/services/api';
import { useSession } from '@/store/session';
import { getSavedUsername, setSavedUsername } from '@/services/settings';
import type { Role } from '@/types';

type Portal = {
  key: Role;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  format: string;
};

const PORTALS: Portal[] = [
  { key: 'teacher', label: 'Teacher', icon: 'school-outline', format: 'Format: T-XXXX' },
  { key: 'admin', label: 'Admin', icon: 'shield-checkmark-outline', format: 'Staff ID' },
  { key: 'accountant', label: 'Accountant', icon: 'calculator-outline', format: 'Staff ID' },
  { key: 'principal', label: 'Principal', icon: 'ribbon-outline', format: 'Staff ID' },
  { key: 'section_head', label: 'Section Head', icon: 'people-outline', format: 'Staff ID' },
];

const ROLE_LABEL: Record<string, string> = {
  teacher: 'Teacher',
  admin: 'Admin',
  accountant: 'Accountant',
  principal: 'Principal',
  section_head: 'Section Head',
};

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useSession();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [portal, setPortal] = useState<Role>('teacher');

  const activePortal = useMemo(
    () => PORTALS.find((p) => p.key === portal) ?? PORTALS[0],
    [portal]
  );

  React.useEffect(() => {
    getSavedUsername().then((u) => {
      if (u) {
        setUsername(u);
        setRemember(true);
      }
    });
  }, []);

  const submit = async () => {
    if (!username.trim() || !password) {
      setError('Enter your username and password');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const user = await login(username.trim(), password);

      // The portal chips pick which dashboard you are signing in to. If the
      // account belongs to a different desk, stop here so the right portal is
      // chosen instead of silently landing on the wrong dashboard.
      if (user.role && user.role !== portal) {
        setError(
          `This is a ${ROLE_LABEL[user.role] ?? user.role} account. Select the ${
            ROLE_LABEL[user.role] ?? user.role
          } portal above and sign in again.`
        );
        return;
      }

      await setSavedUsername(remember ? username.trim() : null);
      await signIn(user);
      router.replace('/(tabs)');
    } catch (e: any) {
      setError(e?.message || 'Login failed. Check your details and try again.');
    } finally {
      setBusy(false);
    }
  };

  const rapidVerify = async () => {
    const saved = await getSavedUsername();
    if (saved) {
      setUsername(saved);
      Alert.alert(
        'Rapid verify',
        'Biometric unlock is not enrolled on this device yet. Your saved staff ID is filled in — enter your password to continue, then enable biometrics from Profile.'
      );
    } else {
      Alert.alert(
        'Rapid verify',
        'No saved staff ID on this device. Turn on “Remember me” and sign in once, then enable biometrics from Profile.'
      );
    }
  };

  const forgot = () => {
    Alert.alert(
      'Password reset',
      'Portal passwords are issued by the SPS IT office. Contact the administrator (or your Section Head) to have your password reset.'
    );
  };

  const staffAccess = () => {
    Alert.alert(
      'Staff access',
      'Every SPS staff member signs in with the ID issued by the IT office. Pick your desk above — Teacher, Admin, Accountant, Principal or Section Head.'
    );
  };

  const version = Constants.expoConfig?.version ?? '1.3.0';

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Emblem */}
          <View style={styles.emblemWrap}>
            <View style={styles.emblem}>
              <Ionicons name="school" size={30} color={COLORS.primary} />
              <Text style={styles.emblemText}>SPS</Text>
            </View>
          </View>

          <View style={styles.officialPill}>
            <Ionicons name="settings-outline" size={13} color={COLORS.primary} />
            <Text style={styles.officialText}>OFFICIAL PORTAL</Text>
          </View>

          <Text style={styles.brand}>Bio Attendance</Text>
          <Text style={styles.brandSub}>Sialkot Campus Portal</Text>

          {/* Role selector */}
          <View style={styles.roleHeader}>
            <Text style={styles.roleHeaderText}>SELECT DESIGNATED ROLE</Text>
            <Pressable onPress={staffAccess} hitSlop={8} style={styles.staffAccess}>
              <Ionicons name="briefcase-outline" size={15} color={COLORS.primary} />
              <Text style={styles.staffAccessText}>Staff Access</Text>
            </Pressable>
          </View>

          <View style={styles.roleRow}>
            {PORTALS.map((p) => {
              const active = p.key === portal;
              return (
                <Pressable
                  key={p.key}
                  onPress={() => {
                    setPortal(p.key);
                    setError(null);
                  }}
                  style={({ pressed }) => [
                    styles.roleChip,
                    active && styles.roleChipActive,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Ionicons
                    name={p.icon}
                    size={16}
                    color={active ? COLORS.onPrimary : COLORS.text}
                  />
                  <Text style={[styles.roleChipText, active && styles.roleChipTextActive]}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Form card */}
          <View style={styles.card}>
            <View style={styles.shiftRow}>
              <View style={styles.liveDot} />
              <Text style={styles.shiftText} numberOfLines={1}>
                Academic Shift: <Text style={styles.shiftStrong}>Morning (Boys &amp; Girls)</Text>
              </Text>
              <Text style={styles.liveText}>Live Server</Text>
            </View>

            <View style={styles.field}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Username / Staff ID</Text>
                <Text style={styles.hint}>{activePortal.format}</Text>
              </View>
              <View style={styles.inputWell}>
                <Ionicons name="person-outline" size={20} color={COLORS.textFaint} />
                <TextInput
                  style={styles.input}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="T-2044"
                  placeholderTextColor={COLORS.textFaint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Portal Password</Text>
              <View style={styles.inputWell}>
                <Ionicons name="lock-closed-outline" size={20} color={COLORS.textFaint} />
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••••••"
                  placeholderTextColor={COLORS.textFaint}
                  secureTextEntry={!reveal}
                  onSubmitEditing={submit}
                />
                <Pressable onPress={() => setReveal((v) => !v)} hitSlop={10}>
                  <Ionicons
                    name={reveal ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={COLORS.textMuted}
                  />
                </Pressable>
              </View>
            </View>

            <View style={styles.optionsRow}>
              <Pressable
                style={styles.remember}
                onPress={() => setRemember((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: remember }}
              >
                <View style={[styles.checkbox, remember && styles.checkboxOn]}>
                  {remember ? <Ionicons name="checkmark" size={15} color="#fff" /> : null}
                </View>
                <Text style={styles.rememberText}>Remember me</Text>
              </Pressable>
              <Pressable onPress={forgot} hitSlop={8}>
                <Text style={styles.forgot}>Forgot Password?</Text>
              </Pressable>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color={COLORS.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              style={({ pressed }) => [
                styles.button,
                pressed && styles.buttonPressed,
                busy && styles.buttonBusy,
              ]}
              onPress={submit}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="log-in-outline" size={20} color="#fff" />
                  <Text style={styles.buttonText}>Log In to Portal</Text>
                </>
              )}
            </Pressable>

            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>OR RAPID VERIFY</Text>
              <View style={styles.divider} />
            </View>

            <Pressable
              onPress={rapidVerify}
              style={({ pressed }) => [styles.ghostButton, pressed && styles.pressed]}
            >
              <Ionicons name="finger-print-outline" size={22} color={COLORS.primary} />
              <Text style={styles.ghostButtonText}>Unlock with Biometrics</Text>
            </Pressable>
          </View>

          {/* Notification strip */}
          <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={20} color={COLORS.primary} />
            <Text style={styles.noticeText}>
              Bio Attendance is synchronizing with the central Sialkot registrar database. Late
              attendance marks require administrative sign-off.
            </Text>
          </View>

          <View style={styles.footerRow}>
            <Ionicons name="shield-checkmark-outline" size={15} color={COLORS.textMuted} />
            <Text style={styles.footerLink}>attendance.spscsialkot.com</Text>
          </View>
          <Text style={styles.footerText}>
            Version {version} (Native Android) • SPS IT Services
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: COLORS.background },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl, paddingBottom: SPACING.xxl },

  emblemWrap: { alignItems: 'center' },
  emblem: {
    width: 92,
    height: 92,
    borderRadius: 24,
    backgroundColor: COLORS.chipIdle,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  emblemText: {
    fontFamily: FONT.bold,
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 1.2,
    color: COLORS.primary,
  },
  officialPill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SPACING.lg,
    backgroundColor: COLORS.lavender,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
  },
  officialText: {
    fontFamily: FONT.medium,
    fontWeight: '600',
    fontSize: 11,
    letterSpacing: 1,
    color: COLORS.primaryDeep,
  },
  brand: {
    marginTop: SPACING.md,
    textAlign: 'center',
    fontSize: 32,
    fontFamily: FONT.bold,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.6,
  },
  brandSub: {
    textAlign: 'center',
    marginTop: 4,
    fontSize: 15,
    color: COLORS.textMuted,
    fontFamily: FONT.regular,
  },

  roleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.xl,
    marginBottom: SPACING.sm,
  },
  roleHeaderText: {
    fontFamily: FONT.medium,
    fontWeight: '600',
    fontSize: 13,
    letterSpacing: 0.6,
    color: COLORS.text,
  },
  staffAccess: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  staffAccessText: {
    fontFamily: FONT.medium,
    fontWeight: '600',
    fontSize: 14,
    color: COLORS.primary,
  },
  roleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: COLORS.chipIdle,
  },
  roleChipActive: { backgroundColor: COLORS.primary },
  roleChipText: { fontSize: 14, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  roleChipTextActive: { color: COLORS.onPrimary },

  card: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    gap: SPACING.lg,
    ...SHADOW.card,
  },
  shiftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.field,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.success },
  shiftText: { flex: 1, fontSize: 13, color: COLORS.textMuted, fontFamily: FONT.regular },
  shiftStrong: { fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  liveText: { fontSize: 13, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.secondary },

  field: { gap: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 15, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  hint: { fontSize: 13, color: COLORS.textFaint, fontFamily: FONT.regular },
  inputWell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 60,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: COLORS.field,
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: 16,
    color: COLORS.text,
    fontFamily: FONT.regular,
  },

  optionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  remember: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  rememberText: { fontSize: 15, fontFamily: FONT.regular, color: COLORS.text },
  forgot: { fontSize: 15, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.primary },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.dangerSoft,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: { color: COLORS.danger, fontSize: 13, flex: 1, fontFamily: FONT.regular },

  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    height: 62,
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    ...SHADOW.lifted,
  },
  buttonPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  buttonBusy: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 17, fontFamily: FONT.medium, fontWeight: '600' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  divider: { flex: 1, height: 1, backgroundColor: COLORS.outline },
  dividerText: {
    fontSize: 11,
    letterSpacing: 0.9,
    fontFamily: FONT.medium,
    fontWeight: '600',
    color: COLORS.textFaint,
  },
  ghostButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 58,
    borderRadius: 16,
    backgroundColor: COLORS.chipIdle,
  },
  ghostButtonText: { fontSize: 16, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },

  notice: {
    flexDirection: 'row',
    gap: 10,
    marginTop: SPACING.lg,
    backgroundColor: COLORS.field,
    borderRadius: 16,
    padding: SPACING.lg,
  },
  noticeText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.neutralChipText,
    fontFamily: FONT.regular,
  },

  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: SPACING.xl,
  },
  footerLink: { fontSize: 14, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.textMuted },
  footerText: {
    textAlign: 'center',
    marginTop: 6,
    fontSize: 13,
    color: COLORS.textFaint,
    fontFamily: FONT.regular,
  },
});
