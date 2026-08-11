import React, { useState } from 'react';
import {
  ActivityIndicator,
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
import { useRouter } from 'expo-router';
import Screen from '@/components/Screen';
import { COLORS, FONT, LABEL_CAPS, RADIUS, SHADOW, SPACING } from '@/constants/theme';
import { login } from '@/services/api';
import { useSession } from '@/store/session';
import { getSavedUsername, setSavedUsername } from '@/services/settings';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useSession();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      await setSavedUsername(remember ? username.trim() : null);
      await signIn(user);
      router.replace('/(tabs)');
    } catch (e: any) {
      setError(e?.message || 'Login failed. Check your details and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View pointerEvents="none" style={styles.blobTop} />
          <View pointerEvents="none" style={styles.blobBottom} />

          <View style={styles.card}>
            <View style={styles.hero}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>SPSC</Text>
              </View>
              <Text style={styles.title}>Daily Student Checking System</Text>
              <Text style={styles.subtitle}>Sign in to continue</Text>
            </View>

            <View style={styles.form}>
              <View style={styles.field}>
                <Text style={[styles.label, LABEL_CAPS]}>Username</Text>
                <View style={styles.inputWrap}>
                  <Ionicons name="person-outline" size={18} color={COLORS.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={username}
                    onChangeText={setUsername}
                    placeholder="Enter username"
                    placeholderTextColor={COLORS.textFaint}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, LABEL_CAPS]}>Password</Text>
                <View style={styles.inputWrap}>
                  <Ionicons name="lock-closed-outline" size={18} color={COLORS.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Enter password"
                    placeholderTextColor={COLORS.textFaint}
                    secureTextEntry
                    onSubmitEditing={submit}
                  />
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
                    {remember ? (
                      <Ionicons name="checkmark" size={13} color="#fff" />
                    ) : null}
                  </View>
                  <Text style={styles.rememberText}>Remember me</Text>
                </Pressable>
                <Text style={styles.forgot}>Forgot password?</Text>
              </View>

              {error ? (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={15} color={COLORS.danger} />
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
                    <Text style={styles.buttonText}>Sign In</Text>
                    <Ionicons name="log-in-outline" size={18} color="#fff" />
                  </>
                )}
              </Pressable>
            </View>
          </View>

          <Text style={styles.footer}>© 2026 Sialkot Public School &amp; College</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: COLORS.background },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: SPACING.lg, paddingVertical: 48 },
  blobTop: {
    position: 'absolute',
    top: -90,
    right: -90,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: COLORS.primarySoft,
    opacity: 0.4,
  },
  blobBottom: {
    position: 'absolute',
    bottom: -90,
    left: -90,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: COLORS.primarySoft,
    opacity: 0.4,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.outline,
    padding: SPACING.xl,
    ...SHADOW.card,
  },
  hero: { alignItems: 'center', marginBottom: SPACING.xl },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  badgeText: { fontSize: 16, fontFamily: FONT.bold, fontWeight: '700', color: COLORS.primary, letterSpacing: 1 },
  title: {
    fontSize: 20,
    fontFamily: FONT.regular,
    fontWeight: '400',
    color: COLORS.text,
    textAlign: 'center',
  },
  subtitle: { fontSize: 14, color: COLORS.textMuted, marginTop: 4, fontFamily: FONT.regular },
  form: { gap: SPACING.md },
  field: { gap: 6 },
  label: { color: COLORS.textMuted },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.background,
  },
  inputIcon: { marginLeft: 14, marginRight: 4 },
  input: { flex: 1, height: '100%', paddingRight: 14, fontSize: 14, color: COLORS.text, fontFamily: FONT.regular },
  optionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  remember: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: COLORS.compliant, borderColor: COLORS.compliant },
  rememberText: { fontSize: 12, fontFamily: FONT.regular, color: COLORS.textMuted },
  forgot: { fontSize: 12, fontFamily: FONT.regular, color: COLORS.primary },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.dangerSoft,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  errorText: { color: COLORS.danger, fontSize: 13, flex: 1, fontFamily: FONT.regular },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    height: 44,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    ...SHADOW.lifted,
  },
  buttonPressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  buttonBusy: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 14, fontFamily: FONT.medium, fontWeight: '600' },
  footer: {
    color: COLORS.textFaint,
    fontSize: 12,
    textAlign: 'center',
    marginTop: SPACING.xl,
    fontFamily: FONT.regular,
  },
});
