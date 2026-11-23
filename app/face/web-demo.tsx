import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Screen from '@/components/Screen';
import Card from '@/components/Card';
import StatCard from '@/components/StatCard';
import { COLORS, FONT, LABEL_CAPS, RADIUS, SPACING } from '@/constants/theme';
import { embeddingFromPhoto, findBestMatch } from '@/services/face';

const DEMO_IMAGE = '/face/demo-face.jpg';

interface DemoResult {
  ms: number;
  dims: number;
  score: number;
  first: string;
  box: string;
}

/**
 * Web-only proof of the browser face engine. It runs the real TinyFaceDetector
 * + MobileFaceNet pipeline on a stock portrait and never touches the database.
 */
export default function WebFaceDemoScreen() {
  const [status, setStatus] = useState('Loading the face engine…');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const run = useCallback(async () => {
    if (Platform.OS !== 'web' || busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    setError(null);
    setResult(null);
    setStatus('Loading TinyFaceDetector and MobileFaceNet…');
    const started = Date.now();

    try {
      const face = await embeddingFromPhoto(DEMO_IMAGE, 0, 0);
      if (!face) {
        setStatus('');
        setError('No face was found in the demo photo.');
        return;
      }

      const match = findBestMatch(
        face.embedding,
        [{ roll: 'demo', name: 'Demo face', embeddings: [face.embedding] }],
        0.5
      );

      setResult({
        ms: Date.now() - started,
        dims: face.embedding.length,
        score: match?.score ?? 0,
        first: face.embedding
          .slice(0, 4)
          .map((v) => v.toFixed(3))
          .join(', '),
        box: `${Math.round(face.box.width)}×${Math.round(face.box.height)} px`,
      });
      setStatus('Face detected — the template was computed in this browser');
    } catch (e: any) {
      setError(e?.message || 'The face engine could not run.');
      setStatus('');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  if (Platform.OS !== 'web') {
    return (
      <Screen>
        <View style={styles.nativeOnly}>
          <Text style={styles.title}>Web preview only</Text>
          <Text style={styles.sub}>Open /face/web-demo in the browser preview.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <Text style={styles.title}>Browser face engine</Text>
          <Text style={styles.sub}>
            TinyFaceDetector + MobileFaceNet — the same 192-number template the Android app
            stores. Everything runs in this browser; nothing is uploaded.
          </Text>
        </View>

        <View style={styles.stats}>
          <StatCard label="Template" value={result ? String(result.dims) : '—'} accent />
          <StatCard label="Self-match" value={result ? result.score.toFixed(3) : '—'} />
          <StatCard label="Time" value={result ? `${(result.ms / 1000).toFixed(1)}s` : '—'} />
        </View>

        <Card style={styles.card}>
          <View style={styles.photoRow}>
            <Image source={{ uri: DEMO_IMAGE }} style={styles.photo} />
            <View style={styles.photoText}>
              <Text style={[styles.label, LABEL_CAPS]}>DEMO PHOTO</Text>
              <Text style={styles.note}>Stock portrait, used only for this engine test.</Text>
              {result ? <Text style={styles.note}>Face box: {result.box}</Text> : null}
            </View>
          </View>

          <View style={styles.statusRow}>
            {busy ? <ActivityIndicator color={COLORS.primary} /> : null}
            <Text style={styles.status}>{error || status}</Text>
          </View>

          {result ? (
            <View style={styles.values}>
              <Text style={[styles.label, LABEL_CAPS]}>FIRST FOUR NUMBERS</Text>
              <Text style={styles.vector}>{result.first}</Text>
              <Text style={styles.note}>
                Self-match is the cosine score of the template against itself. 1.000 means the
                vector is normalised and ready to be matched by the app.
              </Text>
            </View>
          ) : null}

          <Pressable
            onPress={run}
            disabled={busy}
            style={({ pressed }) => [
              styles.btn,
              busy && styles.btnDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="refresh" size={18} color={COLORS.onPrimary} />
            <Text style={styles.btnText}>{busy ? 'Running…' : 'Run again'}</Text>
          </Pressable>
        </Card>

        <Text style={styles.foot}>
          The enrollment screen uses this same engine. Choose a photo there and it adds a sample
          exactly like the phone camera does — no camera needed in the browser.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
    gap: SPACING.lg,
  },
  head: { gap: 6 },
  title: {
    fontSize: 26,
    fontFamily: FONT.display,
    color: COLORS.text,
    letterSpacing: -0.4,
  },
  sub: {
    fontSize: 13,
    fontFamily: FONT.regular,
    color: COLORS.textMuted,
    lineHeight: 19,
  },
  stats: { flexDirection: 'row', gap: SPACING.sm },
  card: { gap: SPACING.md },
  photoRow: { flexDirection: 'row', gap: SPACING.md, alignItems: 'center' },
  photo: {
    width: 112,
    height: 112,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surfaceLow,
  },
  photoText: { flex: 1, gap: 4 },
  label: { color: COLORS.textMuted },
  note: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: COLORS.textMuted,
    lineHeight: 17,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.surfaceLow,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  status: {
    flex: 1,
    fontSize: 13,
    fontFamily: FONT.medium,
    color: COLORS.text,
  },
  values: {
    gap: 4,
    backgroundColor: COLORS.primarySoft,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  vector: {
    fontSize: 18,
    fontFamily: FONT.medium,
    color: COLORS.primaryDeep,
    letterSpacing: 0.4,
  },
  btn: {
    height: 46,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnDisabled: { opacity: 0.55 },
  btnText: {
    color: COLORS.onPrimary,
    fontSize: 14,
    fontFamily: FONT.medium,
    fontWeight: '600',
  },
  pressed: { opacity: 0.9 },
  foot: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: COLORS.textMuted,
    lineHeight: 18,
    textAlign: 'center',
  },
  nativeOnly: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
    gap: 8,
  },
});
