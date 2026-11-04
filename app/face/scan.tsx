import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, FONT, RADIUS, SPACING } from '@/constants/theme';
import { FaceRoster, fetchFaceRoster, saveFaceAttendance } from '@/services/api';
import {
  discardCapture,
  embeddingFromPhoto,
  findBestMatch,
  loadFaceModel,
} from '@/services/face';
import { SessionExpiredError } from '@/types';

const SCAN_INTERVAL_MS = 900;
const UNKNOWN_STATUS_MS = 1800;

export default function FaceScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);

  const [roster, setRoster] = useState<FaceRoster | null>(null);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [cameraReady, setCameraReady] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [present, setPresent] = useState<string[]>([]);
  const [status, setStatus] = useState('Starting camera…');
  const [lastMatch, setLastMatch] = useState<{ name: string; score: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  // Refs keep the scan loop from closing over stale state.
  const presentRef = useRef<Set<string>>(new Set());
  const matchedNowRef = useRef<Set<string>>(new Set());
  const lastUnknownRef = useRef(0);
  const scanningRef = useRef(false);
  const mountedRef = useRef(true);
  const pendingConfirmRef = useRef(false);

  const handleExpired = useCallback(async () => {
    Alert.alert('Session expired', 'Please log in again.');
    router.replace('/(auth)/login');
  }, [router]);

  // Roster + model warm-up.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchFaceRoster();
        if (!alive) return;
        setRoster(data);

        const already = data.students.filter((s) => s.present).map((s) => s.roll);
        presentRef.current = new Set(already);
        setPresent(already);

        if (data.enrolled === 0) {
          Alert.alert(
            'No faces enrolled',
            'Enroll at least one student before starting a face check.',
            [{ text: 'OK', onPress: () => router.back() }]
          );
          return;
        }

        await loadFaceModel();
        if (!alive) return;
        setEngineReady(true);
      } catch (e: any) {
        if (!alive) return;
        if (e instanceof SessionExpiredError) {
          await handleExpired();
          return;
        }
        setEngineError(e?.message || 'Could not prepare the face engine.');
      }
    })();

    return () => {
      alive = false;
    };
  }, [handleExpired, router]);

  // Live scan loop.
  useEffect(() => {
    mountedRef.current = true;
    if (!cameraReady || !engineReady || !roster) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (!mountedRef.current) return;

      // While a verification popup is open, hold the scan loop so we do not
      // capture another student (or re-fire) until the teacher confirms.
      if (pendingConfirmRef.current) {
        timer = setTimeout(tick, SCAN_INTERVAL_MS);
        return;
      }

      if (!scanningRef.current && camera.current) {
        scanningRef.current = true;
        setBusy(true);
        let shotUri: string | null = null;
        try {
          const photo = await camera.current.takePictureAsync({
            quality: 0.5,
            skipProcessing: false,
          });
          shotUri = photo?.uri ?? null;
          if (photo?.uri && photo.width && photo.height) {
            const result = await embeddingFromPhoto(photo.uri, photo.width, photo.height);

            if (!mountedRef.current) return;

            if (!result) {
              if (Date.now() - lastUnknownRef.current > UNKNOWN_STATUS_MS) {
                lastUnknownRef.current = Date.now();
                setStatus('No face in view — hold the phone steady');
              }
            } else {
              const candidates = roster.students
                .filter((s) => s.samples > 0)
                .map((s) => ({ roll: s.roll, name: s.name, embeddings: s.embeddings }));

              const match = findBestMatch(result.embedding, candidates, roster.threshold);

              if (!match) {
                if (Date.now() - lastUnknownRef.current > UNKNOWN_STATUS_MS) {
                  lastUnknownRef.current = Date.now();
                  setStatus('Face not recognised — move closer');
                }
              } else if (!presentRef.current.has(match.roll)) {
                presentRef.current.add(match.roll);
                matchedNowRef.current.add(match.roll);
                setPresent(Array.from(presentRef.current));
                setLastMatch({ name: match.name, score: match.score });
                setStatus(`${match.name} verified present`);
                Vibration.vibrate(70);
                // Popup verification: pause scanning until the teacher confirms,
                // then continue to the next student.
                pendingConfirmRef.current = true;
                setBusy(false);
                Alert.alert(
                  'Verified',
                  `${match.name} was recognised and marked present.\n\nTake the next student?`,
                  [{ text: 'Continue', onPress: () => { pendingConfirmRef.current = false; } }]
                );
              } else {
                setStatus(`${match.name} already present`);
              }
            }
          }
        } catch (e: any) {
          if (mountedRef.current) setStatus(e?.message || 'Scan failed — try again');
        } finally {
          discardCapture(shotUri);
          scanningRef.current = false;
          if (mountedRef.current) setBusy(false);
        }
      }

      if (mountedRef.current) timer = setTimeout(tick, SCAN_INTERVAL_MS);
    };

    timer = setTimeout(tick, 500);

    return () => {
      mountedRef.current = false;
      if (timer) clearTimeout(timer);
    };
  }, [cameraReady, engineReady, roster]);

  const save = async (markAbsent: boolean) => {
    if (!roster || saving) return;
    setSaving(true);
    try {
      const res = await saveFaceAttendance(
        Array.from(matchedNowRef.current),
        roster.date,
        undefined,
        markAbsent
      );
      if (!res.ok) {
        Alert.alert('Could not save', res.message);
        return;
      }
      Alert.alert('Saved', res.message, [
        { text: 'Done', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      if (e instanceof SessionExpiredError) {
        await handleExpired();
        return;
      }
      Alert.alert('Could not save', e?.message || 'Check your connection.');
    } finally {
      setSaving(false);
    }
  };

  const finish = () => {
    if (!roster || saving) return;
    const marked = Array.from(matchedNowRef.current);

    if (marked.length === 0) {
      Alert.alert('Nothing to save', 'No new students were recognised in this session.', [
        { text: 'Keep scanning' },
        { text: 'Close', onPress: () => router.back() },
      ]);
      return;
    }

    const remaining = Math.max(0, roster.total - presentRef.current.size);
    if (remaining === 0) {
      void save(false);
      return;
    }

    Alert.alert(
      'Finish attendance?',
      `${marked.length} new student${marked.length === 1 ? '' : 's'} saved present. ` +
        `${remaining} not recognised can be marked absent — students a teacher already saved are left untouched.`,
      [
        { text: 'Keep scanning', style: 'cancel' },
        { text: 'Present only', onPress: () => void save(false) },
        { text: 'Save + absent', style: 'destructive', onPress: () => void save(true) },
      ]
    );
  };

  const close = () => {
    if (matchedNowRef.current.size > 0) {
      Alert.alert('Discard this session?', 'Recognised students have not been saved yet.', [
        { text: 'Keep scanning', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => router.back() },
      ]);
      return;
    }
    router.back();
  };

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.center} edges={['top', 'bottom']}>
        <View style={styles.permIcon}>
          <Ionicons name="camera-outline" size={28} color={COLORS.primary} />
        </View>
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permBody}>
          The camera looks for enrolled faces and marks them present. Matching
          happens on this phone; only the result is sent to the server.
        </Text>
        <Pressable style={styles.primaryBtn} onPress={requestPermission}>
          <Text style={styles.primaryBtnText}>Allow camera</Text>
        </Pressable>
        <Pressable style={styles.ghostBtn} onPress={() => router.back()}>
          <Text style={styles.ghostBtnText}>Not now</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const total = roster?.total ?? 0;
  const presentCount = present.length;
  const progress = total > 0 ? presentCount / total : 0;

  return (
    <View style={styles.root}>
      <CameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        facing={facing}
        animateShutter={false}
        onCameraReady={() => setCameraReady(true)}
      />

      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <Pressable
            onPress={close}
            hitSlop={12}
            style={({ pressed }) => [styles.roundBtn, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
          <View style={styles.topText}>
            <Text style={styles.topTitle}>Face check</Text>
            <Text style={styles.topSub}>
              {roster ? `Class ${roster.class} · ${total} students` : 'Loading roster…'}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              setCameraReady(false);
              setFacing((f) => (f === 'back' ? 'front' : 'back'));
            }}
            hitSlop={12}
            style={({ pressed }) => [styles.roundBtn, pressed && styles.pressed]}
          >
            <Ionicons name="camera-reverse-outline" size={21} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.guideWrap} pointerEvents="none">
          <View style={styles.aiPill}>
            <View style={styles.aiDot} />
            <Text style={styles.aiText}>AI BIOMETRIC ACTIVE</Text>
          </View>
          <View style={styles.guide}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <View style={styles.statusPill}>
            {busy ? <ActivityIndicator size="small" color="#fff" /> : null}
            <Text style={styles.statusText} numberOfLines={2}>
              {engineError ? engineError : status}
            </Text>
          </View>
        </View>

        <View style={styles.bottom}>
          <View style={styles.progressRow}>
            <Text style={styles.progressLabel}>Present</Text>
            <Text style={styles.progressValue}>
              {presentCount}
              <Text style={styles.progressTotal}> / {total}</Text>
            </Text>
          </View>

          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>

          {lastMatch ? (
            <View style={styles.lastMatch}>
              <View style={styles.checkIcon}>
                <Ionicons name="checkmark" size={16} color={COLORS.compliant} />
              </View>
              <Text style={styles.lastMatchText} numberOfLines={1}>
                {lastMatch.name}
              </Text>
              <Text style={styles.lastMatchScore}>{lastMatch.score.toFixed(2)}</Text>
            </View>
          ) : (
            <Text style={styles.waiting}>
              {engineReady ? 'Point the camera at each student' : 'Preparing face engine…'}
            </Text>
          )}

          <Pressable
            onPress={finish}
            disabled={saving}
            style={({ pressed }) => [
              styles.primaryBtn,
              saving && styles.primaryBtnBusy,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.primaryBtnText}>
              {saving ? 'Saving…' : `Finish & save (${matchedNowRef.current.size})`}
            </Text>
          </Pressable>

          <Text style={styles.hint}>
            Not recognised? You choose whether to mark them absent when saving.
            Existing entries are never overwritten.
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 12,
  },
  overlay: { flex: 1, justifyContent: 'space-between' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: SPACING.md,
    paddingTop: 8,
  },
  roundBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topText: { flex: 1 },
  topTitle: { color: '#fff', fontSize: 16, fontFamily: FONT.medium, fontWeight: '600' },
  topSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontFamily: FONT.regular, marginTop: 1 },
  guideWrap: { alignItems: 'center', gap: 14 },
  guide: {
    width: 240,
    height: 300,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  corner: { position: 'absolute', width: 30, height: 30, borderColor: 'rgba(120,200,255,0.95)' },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 12 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 12 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 12 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 12 },
  aiPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
  },
  aiDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#67E8F9' },
  aiText: {
    color: '#fff',
    fontSize: 10.5,
    letterSpacing: 0.8,
    fontFamily: FONT.medium,
    fontWeight: '600',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 320,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
  },
  statusText: {
    color: '#fff',
    fontSize: 12.5,
    fontFamily: FONT.medium,
    textAlign: 'center',
  },
  bottom: {
    backgroundColor: 'rgba(16,18,22,0.75)',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 18,
    gap: 10,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  progressRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  progressLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontFamily: FONT.medium,
  },
  progressValue: { color: '#fff', fontSize: 22, fontFamily: FONT.medium, fontWeight: '600' },
  progressTotal: { color: 'rgba(255,255,255,0.55)', fontSize: 14, fontFamily: FONT.regular },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: 3, backgroundColor: COLORS.success },
  lastMatch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: RADIUS.md,
    padding: 10,
  },
  checkIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E8F5EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lastMatchText: { flex: 1, color: '#fff', fontSize: 13.5, fontFamily: FONT.medium },
  lastMatchScore: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontFamily: FONT.regular,
    fontVariant: ['tabular-nums'],
  },
  waiting: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12.5,
    fontFamily: FONT.regular,
    paddingVertical: 6,
  },
  primaryBtn: {
    alignSelf: 'stretch',
    height: 48,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnBusy: { opacity: 0.7 },
  primaryBtnText: { color: COLORS.onPrimary, fontSize: 14, fontFamily: FONT.medium, fontWeight: '600' },
  hint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10.5,
    fontFamily: FONT.regular,
    textAlign: 'center',
    lineHeight: 15,
  },
  permIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permTitle: { fontSize: 19, fontFamily: FONT.medium, fontWeight: '600', color: COLORS.text },
  permBody: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 19,
    fontFamily: FONT.regular,
  },
  ghostBtn: { height: 44, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  ghostBtnText: { color: COLORS.textMuted, fontSize: 14, fontFamily: FONT.medium },
  pressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
});
