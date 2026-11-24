import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, FONT, RADIUS, SPACING } from '@/constants/theme';
import { clearFaceStudent, enrollFaceStudent } from '@/services/api';
import { discardCapture, embeddingFromPhoto } from '@/services/face';
import { SessionExpiredError } from '@/types';

const TARGET_SAMPLES = 3;

export default function FaceEnrollScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    roll?: string;
    name?: string;
    className?: string;
    samples?: string;
    queue?: string;
    qi?: string;
  }>();

  const roll = String(params.roll || '');
  const name = String(params.name || 'Student');
  const className = params.className ? String(params.className) : undefined;
  const alreadyEnrolled = Number(params.samples || 0) > 0;

  const queueParam = params.queue ? String(params.queue) : '';
  const queueIndex = params.qi !== undefined ? Number(params.qi) : -1;
  let parsedQueue: { roll: string; name: string }[] = [];
  try {
    if (queueParam) parsedQueue = JSON.parse(queueParam);
  } catch {
    parsedQueue = [];
  }

  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  // Camera restart state (fix 4): the native session can die while the app is
  // backgrounded and CameraView does not heal itself — flipping front/back
  // only worked because it forced a restart. Bumping camKey remounts the
  // camera; cameraReady tracks whether it actually came back.
  const [camKey, setCamKey] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStalled, setCameraStalled] = useState(false);
  const cameraReadyRef = useRef(false);
  const stallRetryRef = useRef(0);
  const firstFocusRef = useRef(true);

  // Restart the camera every time this screen gains focus. The first focus
  // is the fresh mount itself, so it is skipped.
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false;
        return;
      }
      setCamKey((k) => k + 1);
    }, [])
  );

  // If the camera has not reported ready within ~6s of a (re)start, retry
  // the mount once automatically (the back camera can be slow to reopen and
  // 3s was too tight) — only if the retry also stalls, offer a manual
  // restart instead of leaving a black preview.
  useEffect(() => {
    cameraReadyRef.current = false;
    setCameraReady(false);
    setCameraStalled(false);
    const t = setTimeout(() => {
      if (!cameraReadyRef.current) {
        if (stallRetryRef.current < 1) {
          stallRetryRef.current += 1;
          setCamKey((k) => k + 1);
        } else {
          setCameraStalled(true);
        }
      }
    }, 6000);
    return () => clearTimeout(t);
  }, [camKey, facing]);

  const [samples, setSamples] = useState<number[][]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string>('Center the face inside the frame');

  const capture = async () => {
    if (!camera.current || busy || samples.length >= TARGET_SAMPLES) return;
    setBusy(true);
    setStatus('Reading face…');
    let shotUri: string | null = null;

    try {
      const photo = await camera.current.takePictureAsync({
        quality: 0.6,
        skipProcessing: false,
      });

      shotUri = photo?.uri ?? null;
      if (!photo?.uri) throw new Error('The camera did not return a photo.');

      const result = await embeddingFromPhoto(
        photo.uri,
        photo.width || 0,
        photo.height || 0
      );

      if (!result) {
        setStatus('No face detected — move closer and hold still');
        return;
      }

      const next = [...samples, result.embedding];
      setSamples(next);
      setStatus(
        next.length >= TARGET_SAMPLES
          ? 'All samples captured — save to finish'
          : `Sample ${next.length} of ${TARGET_SAMPLES} captured`
      );
    } catch (e: any) {
      setStatus(e?.message || 'Could not read the face. Try again.');
    } finally {
      discardCapture(shotUri);
      setBusy(false);
    }
  };

  /**
   * Web fallback: browsers only expose the camera on https/localhost and this
   * preview's camera permission is not granted, so a photo (or three) can be
   * used instead. The same engine turns the face into the same 192 numbers.
   */
  const pickPhotos = async () => {
    if (Platform.OS !== 'web' || busy || samples.length >= TARGET_SAMPLES) return;

    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        multiple: true,
        copyToCacheDirectory: false,
      });
      if (picked.canceled) return;

      const assets = picked.assets ?? [];
      if (assets.length === 0) return;

      setBusy(true);
      setStatus('Reading photo…');

      const next = [...samples];
      for (const asset of assets) {
        if (next.length >= TARGET_SAMPLES) break;

        try {
          const result = await embeddingFromPhoto(asset.uri, 0, 0);
          if (!result) {
            setStatus(
              `${asset.name || 'That photo'}: no face found — use a clear, front-facing photo.`
            );
            continue;
          }

          next.push(result.embedding);
          setSamples([...next]);
          setStatus(
            next.length >= TARGET_SAMPLES
              ? 'All samples captured — save to finish'
              : `Sample ${next.length} of ${TARGET_SAMPLES} captured`
          );
        } catch (e: any) {
          setStatus(`${asset.name || 'That photo'}: ${e?.message || 'could not read the face.'}`);
        }
      }

      if (next.length === samples.length && next.length < TARGET_SAMPLES) {
        // Every photo failed; the last status already says why.
      }
    } catch (e: any) {
      setStatus(e?.message || 'Could not open the photo picker.');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (samples.length === 0 || saving) return;
    setSaving(true);
    try {
      const res = await enrollFaceStudent({ className, roll, embeddings: samples });
      if (!res.ok) {
        Alert.alert('Could not save', res.message);
        return;
      }

      const nextIndex = queueIndex >= 0 ? queueIndex + 1 : -1;
      if (nextIndex >= 0 && nextIndex < parsedQueue.length) {
        const next = parsedQueue[nextIndex];
        router.replace({
          pathname: '/face/enroll',
          params: {
            roll: next.roll,
            name: next.name,
            className: className,
            samples: '0',
            queue: queueParam,
            qi: String(nextIndex),
          },
        });
        return;
      }

      Alert.alert('Face enrolled', `${name} is now enrolled for face attendance.`, [
        { text: 'Done', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      if (e instanceof SessionExpiredError) {
        Alert.alert('Session expired', 'Please log in again.');
        router.replace('/(auth)/login');
        return;
      }
      Alert.alert('Could not save', e?.message || 'Check your connection.');
    } finally {
      setSaving(false);
    }
  };

  // Skip this student (absent today) without enrolling — advance the queue
  // exactly like save() does after a successful enrolment, minus the server
  // call. Samples are cleared first so the next student starts fresh even
  // if this screen is not remounted by the navigation.
  const skip = () => {
    if (busy || saving) return;
    if (queueIndex < 0) {
      router.back();
      return;
    }
    setSamples([]);
    setStatus('Center the face inside the frame');
    const nextIndex = queueIndex + 1;
    if (nextIndex < parsedQueue.length) {
      const next = parsedQueue[nextIndex];
      router.replace({
        pathname: '/face/enroll',
        params: {
          roll: next.roll,
          name: next.name,
          className: className,
          samples: '0',
          queue: queueParam,
          qi: String(nextIndex),
        },
      });
      return;
    }
    Alert.alert('Done', 'No more students to enrol.', [
      { text: 'Done', onPress: () => router.back() },
    ]);
  };

  const remove = () => {
    Alert.alert('Remove face data?', `${name} will need to be enrolled again.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await clearFaceStudent({ className, roll });
            if (!res.ok) {
              Alert.alert('Could not remove', res.message);
              return;
            }
            router.back();
          } catch (e: any) {
            Alert.alert('Could not remove', e?.message || 'Check your connection.');
          }
        },
      },
    ]);
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
          Face enrollment takes three quick photos. Only the mathematical face
          template is uploaded — the photos never leave this phone.
        </Text>
        <Pressable style={styles.primaryBtn} onPress={requestPermission}>
          <Text style={styles.primaryBtnText}>Allow camera</Text>
        </Pressable>
        {Platform.OS === 'web' ? (
          <Pressable style={styles.webPickBtn} onPress={pickPhotos} disabled={busy}>
            <Ionicons name="images-outline" size={18} color={COLORS.primary} />
            <Text style={styles.webPickText}>
              {busy ? 'Reading photo…' : 'Choose photos instead'}
            </Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.ghostBtn} onPress={() => router.back()}>
          <Text style={styles.ghostBtnText}>Not now</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        key={`${facing}-${camKey}`}
        ref={camera}
        style={StyleSheet.absoluteFill}
        facing={facing}
        animateShutter={false}
        onCameraReady={() => {
          cameraReadyRef.current = true;
          stallRetryRef.current = 0;
          setCameraReady(true);
          setCameraStalled(false);
        }}
        onMountError={(e) => setStatus(e?.message || 'Camera failed to start — tap restart below')}
      />

      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={({ pressed }) => [styles.roundBtn, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>
          <View style={styles.topText}>
            <Text style={styles.topTitle} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.topSub}>
              Roll {roll}
              {className ? ` · Class ${className}` : ''}
            </Text>
          </View>
          <View style={styles.topRight}>
            <Pressable
              onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))}
              hitSlop={12}
              style={({ pressed }) => [styles.roundBtn, pressed && styles.pressed]}
            >
              <Ionicons name="camera-reverse-outline" size={20} color="#fff" />
            </Pressable>
            {alreadyEnrolled ? (
              <Pressable
                onPress={remove}
                hitSlop={12}
                style={({ pressed }) => [styles.roundBtn, pressed && styles.pressed]}
              >
                <Ionicons name="trash-outline" size={19} color="#fff" />
              </Pressable>
            ) : (
              <View style={styles.roundBtnSpacer} />
            )}
          </View>
        </View>

        <View style={styles.guideWrap} pointerEvents="none">
          <View style={styles.guide} />
          <Text style={styles.guideText}>{status}</Text>
        </View>

        <View style={styles.bottom}>
          {cameraStalled ? (
            <Pressable
              onPress={() => {
                stallRetryRef.current = 0;
                setCamKey((k) => k + 1);
              }}
              style={({ pressed }) => [styles.restartBtn, pressed && styles.pressed]}
            >
              <Ionicons name="refresh-outline" size={16} color="#fff" />
              <Text style={styles.restartBtnText}>Camera didn&apos;t start — tap to restart</Text>
            </Pressable>
          ) : null}
          <View style={styles.dots}>
            {Array.from({ length: TARGET_SAMPLES }).map((_, i) => (
              <View key={i} style={[styles.dot, i < samples.length && styles.dotDone]} />
            ))}
          </View>

          <Pressable
            onPress={capture}
            disabled={busy || samples.length >= TARGET_SAMPLES}
            style={({ pressed }) => [
              styles.shutter,
              (busy || samples.length >= TARGET_SAMPLES) && styles.shutterDisabled,
              pressed && styles.pressed,
            ]}
          >
            {busy ? (
              <ActivityIndicator color={COLORS.primary} />
            ) : (
              <Ionicons name="camera" size={26} color={COLORS.primary} />
            )}
          </Pressable>

          <Text style={styles.hint}>
            {samples.length >= TARGET_SAMPLES
              ? 'Look straight, then save.'
              : `${facing === 'front' ? 'Front' : 'Back'} camera · good light · no glasses glare.`}
          </Text>

          {Platform.OS === 'web' ? (
            <Pressable
              onPress={pickPhotos}
              disabled={busy || samples.length >= TARGET_SAMPLES}
              style={[styles.webPickBtn, styles.webPickBtnDark]}
            >
              <Ionicons name="images-outline" size={18} color="#fff" />
              <Text style={[styles.webPickText, styles.webPickTextDark]}>
                {busy ? 'Reading photo…' : 'Choose photos'}
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={save}
            disabled={samples.length === 0 || saving}
            style={({ pressed }) => [
              styles.primaryBtn,
              (samples.length === 0 || saving) && styles.primaryBtnDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.primaryBtnText}>
              {saving
                ? 'Saving…'
                : samples.length === 0
                ? 'Capture at least one sample'
                : `Save face (${samples.length} sample${samples.length === 1 ? '' : 's'})`}
            </Text>
          </Pressable>

          {queueIndex >= 0 ? (
            <Pressable
              onPress={skip}
              disabled={busy || saving}
              style={({ pressed }) => [styles.skipBtn, pressed && styles.pressed]}
            >
              <Text style={styles.skipBtnText}>Skip — absent today</Text>
            </Pressable>
          ) : null}
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
  roundBtnSpacer: { width: 38, height: 38 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topText: { flex: 1 },
  topTitle: { color: '#fff', fontSize: 16, fontFamily: FONT.medium, fontWeight: '600' },
  topSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontFamily: FONT.regular, marginTop: 1 },
  guideWrap: { alignItems: 'center', gap: 14 },
  guide: {
    width: 230,
    height: 290,
    borderRadius: 120,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  guideText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: FONT.medium,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    textAlign: 'center',
  },
  bottom: {
    backgroundColor: 'rgba(16,18,22,0.72)',
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 22,
    gap: 14,
    alignItems: 'center',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  dots: { flexDirection: 'row', gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.28)' },
  dotDone: { backgroundColor: COLORS.primary },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterDisabled: { opacity: 0.45 },
  hint: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: FONT.regular, textAlign: 'center' },
  primaryBtn: {
    alignSelf: 'stretch',
    height: 48,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: { backgroundColor: 'rgba(45,108,223,0.45)' },
  primaryBtnText: { color: COLORS.onPrimary, fontSize: 14, fontFamily: FONT.medium, fontWeight: '600' },
  restartBtn: {
    alignSelf: 'stretch',
    height: 44,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  restartBtnText: { color: '#fff', fontSize: 13, fontFamily: FONT.medium },
  skipBtn: { height: 40, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  skipBtnText: { color: 'rgba(255,255,255,0.75)', fontSize: 13.5, fontFamily: FONT.medium },
  ghostBtn: { height: 44, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  ghostBtnText: { color: COLORS.textMuted, fontSize: 14, fontFamily: FONT.medium },
  webPickBtn: {
    alignSelf: 'stretch',
    height: 44,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  webPickBtnDark: { borderColor: 'rgba(255,255,255,0.55)' },
  webPickText: { color: COLORS.primary, fontSize: 13, fontFamily: FONT.medium, fontWeight: '600' },
  webPickTextDark: { color: '#fff' },
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
  pressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
});
