import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, FONT, RADIUS } from '@/constants/theme';
import { login } from '@/services/api';
import { useSession } from '@/store/session';
import { getSavedUsername, setSavedUsername } from '@/services/settings';
import type { Role } from '@/types';

type Portal = {
  key: Role;
  label: string;
};

const PORTALS: Portal[] = [
  { key: 'teacher', label: 'Teacher' },
  { key: 'admin', label: 'Admin' },
  { key: 'accountant', label: 'Accountant' },
  { key: 'principal', label: 'Principal' },
  { key: 'section_head', label: 'Section Head' },
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

  const forgot = () => {
    Alert.alert(
      'Password reset',
      'Portal passwords are issued by the SPS IT office. Contact the administrator (or your Section Head) to have your password reset.'
    );
  };

  const version = Constants.expoConfig?.version ?? '1.4.22';

  return (
    <ImageBackground
      source={require('../../assets/login-gradient.png')}
      style={styles.root}
      resizeMode="cover"
    >
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* School emblem */}
            <View style={styles.emblemWrap}>
              <View style={styles.logoBadge}>
                <Image
                  source={require('../../assets/sps.png')}
                  style={styles.logo}
                  resizeMode="contain"
                  accessibilityIgnoresInvertColors
                />
              </View>
            </View>

            <Text style={styles.brand}>BIO ATTENDANCE</Text>
            <Text style={styles.welcome}>Welcome Back</Text>

            {/* Role selector */}
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
                    <Text style={[styles.roleChipText, active && styles.roleChipTextActive]}>
                      {p.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Staff ID */}
            <View style={styles.fields}>
              <View style={styles.inputWell}>
                <TextInput
                  style={styles.input}
                  value={username}
                  onChangeText={setUsername}
                  placeholder={
                    activePortal.key === 'teacher' ? 'Staff ID · T-2044' : 'Staff ID'
                  }
                  placeholderTextColor="rgba(255,255,255,0.75)"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                />
              </View>

              {/* Password */}
              <View style={styles.inputWell}>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor="rgba(255,255,255,0.75)"
                  secureTextEntry={!reveal}
                  onSubmitEditing={submit}
                />
                <Pressable onPress={() => setReveal((v) => !v)} hitSlop={10}>
                  <Ionicons
                    name={reveal ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="rgba(255,255,255,0.85)"
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
                  {remember ? <Ionicons name="checkmark" size={15} color={COLORS.primary} /> : null}
                </View>
                <Text style={styles.rememberText}>Remember me</Text>
              </Pressable>
              <Pressable onPress={forgot} hitSlop={8}>
                <Text style={styles.forgot}>Forgot Password?</Text>
              </Pressable>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color="#fff" />
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
                <ActivityIndicator color={COLORS.primary} />
              ) : (
                <Text style={styles.buttonText}>LOG IN</Text>
              )}
            </Pressable>

            <View style={styles.footerRow}>
              <View style={styles.liveDot} />
              <Text style={styles.footerText}>Live · Version {version}</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, backgroundColor: 'transparent' },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 48,
  },

  emblemWrap: { alignItems: 'center' },
  logoBadge: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 6,
  },
  logo: { width: 66, height: 66 },
  brand: {
    marginTop: 14,
    textAlign: 'center',
    fontSize: 12,
    fontFamily: FONT.display,
    fontWeight: '300',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 4,
  },
  welcome: {
    marginTop: 36,
    textAlign: 'center',
    fontSize: 36,
    fontFamily: FONT.display,
    fontWeight: '300',
    color: '#FFFFFF',
    letterSpacing: 1,
  },

  roleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginTop: 24,
  },
  roleChip: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
    paddingHorizontal: 13,
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  roleChipActive: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  roleChipText: {
    fontSize: 13,
    fontFamily: FONT.display,
    fontWeight: '300',
    color: '#FFFFFF',
  },
  roleChipTextActive: { color: COLORS.primary, fontFamily: FONT.regular, fontWeight: '400' },

  fields: { marginTop: 22, gap: 12 },
  inputWell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 54,
    paddingHorizontal: 20,
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: 15,
    color: '#FFFFFF',
    fontFamily: FONT.display,
    fontWeight: '300',
  },

  optionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  remember: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  rememberText: { fontSize: 14, fontFamily: FONT.display, fontWeight: '300', color: '#FFFFFF' },
  forgot: { fontSize: 14, fontFamily: FONT.display, fontWeight: '300', color: '#FFFFFF' },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(220,38,38,0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 16,
  },
  errorText: { color: '#FFFFFF', fontSize: 13, flex: 1, fontFamily: FONT.regular },

  button: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.full,
    marginTop: 22,
  },
  buttonPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  buttonBusy: { opacity: 0.7 },
  buttonText: {
    color: COLORS.primary,
    fontSize: 17,
    fontFamily: FONT.display,
    fontWeight: '300',
    letterSpacing: 3,
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },

  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 34,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ADE80' },
  footerText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    fontFamily: FONT.display,
    fontWeight: '300',
  },
});
