/**
 * Issue Executive Order — the principal's compose screen.
 *
 * An order is a staff-wide notice: it posts to `notices/send` with the
 * audience "teachers", so it lands in every teacher's Notices list, where the
 * principal sender carries the shield highlight. This screen deliberately does
 * NOT open the Notices list — writing an order and reading the feed are two
 * different jobs.
 */
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
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import Screen from '@/components/Screen';
import AppBar from '@/components/AppBar';
import { COLORS, FONT, LABEL_CAPS, RADIUS, SPACING } from '@/constants/theme';
import { sendExecutiveOrder } from '@/services/api';
import { useSession } from '@/store/session';
import { SessionExpiredError } from '@/types';

const SUBJECT_MAX = 120;
const BODY_MAX = 2000;

export default function ExecutiveOrderScreen() {
  const router = useRouter();
  const { user } = useSession();
  const canIssue = user?.role === 'principal' || user?.role === 'admin';

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = useMemo(() => body.trim().length > 0, [body]);

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await sendExecutiveOrder({
        subject: subject.trim() || 'Executive Order',
        body: body.trim(),
      });
      Alert.alert(
        'Order issued',
        'The order is now in every teacher’s Notices feed, stamped with the principal’s badge.',
        [{ text: 'Done', onPress: () => router.back() }]
      );
    } catch (e: any) {
      if (e instanceof SessionExpiredError) {
        router.replace('/login' as any);
        return;
      }
      setError(e?.message || 'Could not post the order. Check the connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!canIssue) {
    return (
      <Screen>
        <AppBar showBell={false} />
        <View style={styles.blocked}>
          <Ionicons name="lock-closed-outline" size={22} color={COLORS.textMuted} />
          <Text style={styles.blockedText}>
            Only the Principal or an administrator can issue an executive order.
          </Text>
          <Pressable onPress={() => router.back()} style={styles.blockedBtn}>
            <Text style={styles.blockedBtnText}>Go back</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <AppBar showBell={false} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.head}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              style={({ pressed }) => [styles.back, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Ionicons name="chevron-back-outline" size={18} color={COLORS.primary} />
            </Pressable>
            <View style={styles.flex}>
              <Text style={styles.title}>Executive Order</Text>
              <Text style={styles.sub}>Circular to all teaching staff</Text>
            </View>
            <View style={styles.badge}>
              <Ionicons name="shield-checkmark" size={11} color={COLORS.primary} />
              <Text style={styles.badgeText}>PRINCIPAL</Text>
            </View>
          </View>

          <View style={styles.notice}>
            <Ionicons name="megaphone-outline" size={15} color={COLORS.primary} />
            <Text style={styles.noticeText}>
              Published to every teacher’s Notices feed the moment you post it. It cannot be edited
              afterwards.
            </Text>
          </View>

          <Text style={styles.label}>SUBJECT</Text>
          <TextInput
            value={subject}
            onChangeText={(t) => setSubject(t.slice(0, SUBJECT_MAX))}
            placeholder="e.g. Morning assembly timing from Monday"
            placeholderTextColor={COLORS.textFaint}
            style={styles.input}
            maxLength={SUBJECT_MAX}
            returnKeyType="next"
          />
          <Text style={styles.counter}>
            {subject.length}/{SUBJECT_MAX}
          </Text>

          <Text style={styles.label}>ORDER</Text>
          <TextInput
            value={body}
            onChangeText={(t) => setBody(t.slice(0, BODY_MAX))}
            placeholder="Write the instruction exactly as the staff should read it…"
            placeholderTextColor={COLORS.textFaint}
            style={[styles.input, styles.bodyInput]}
            multiline
            textAlignVertical="top"
            maxLength={BODY_MAX}
          />
          <Text style={styles.counter}>
            {body.trim().length}/{BODY_MAX}
          </Text>

          {error ? (
            <View style={styles.error}>
              <Ionicons name="alert-circle-outline" size={14} color={COLORS.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={() => void submit()}
            disabled={!ready || busy}
            style={({ pressed }) => [
              styles.post,
              (!ready || busy) && styles.postDisabled,
              pressed && ready && !busy && styles.pressed,
            ]}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="paper-plane-outline" size={17} color="#fff" />
            )}
            <Text style={styles.postText}>{busy ? 'Issuing…' : 'Issue order to all teachers'}</Text>
          </Pressable>

          <Text style={styles.foot}>
            Issued as {user?.name || user?.username || 'Principal'} • Sialkot Campus
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingBottom: SPACING.xxl, gap: 6 },
  pressed: { opacity: 0.9 },

  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: SPACING.sm },
  back: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 19, fontFamily: FONT.display, fontWeight: '300', color: COLORS.text },
  sub: { fontSize: 11.5, color: COLORS.textMuted, fontFamily: FONT.regular, marginTop: 2 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.lavender,
    borderRadius: RADIUS.full,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 9.5, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.primary, letterSpacing: 0.6 },

  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: COLORS.primarySoft,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  noticeText: { flex: 1, fontSize: 11.5, lineHeight: 17, color: COLORS.primaryDeep, fontFamily: FONT.regular },

  label: { ...LABEL_CAPS, marginTop: SPACING.md, marginBottom: 6, fontSize: 10.5 },
  input: {
    backgroundColor: COLORS.field,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    fontSize: 13.5,
    color: COLORS.text,
    fontFamily: FONT.regular,
  },
  bodyInput: { minHeight: 150, paddingTop: 12 },
  counter: { fontSize: 10.5, color: COLORS.textFaint, fontFamily: FONT.regular, alignSelf: 'flex-end', marginTop: 4 },

  error: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: COLORS.dangerSoft,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.sm,
  },
  errorText: { flex: 1, fontSize: 11.5, color: COLORS.danger, fontFamily: FONT.regular, lineHeight: 16 },

  post: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    marginTop: SPACING.lg,
  },
  postDisabled: { opacity: 0.45 },
  postText: { fontSize: 13.5, fontFamily: FONT.medium, fontWeight: '600', color: '#fff' },
  foot: { fontSize: 10.5, color: COLORS.textFaint, fontFamily: FONT.regular, textAlign: 'center', marginTop: SPACING.md },

  blocked: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: SPACING.xl },
  blockedText: { fontSize: 13, color: COLORS.textMuted, fontFamily: FONT.regular, textAlign: 'center', lineHeight: 19 },
  blockedBtn: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.primarySoft,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 10,
  },
  blockedBtnText: { fontSize: 12.5, color: COLORS.primary, fontFamily: FONT.medium, fontWeight: '600' },
});
