/**
 * Animated launch screen (design: Downloads/sps_splash).
 *
 * Renders above the navigator on cold start: the crest scales in inside a
 * scanning frame, the gold ring pulses and spins, the copy staggers in and a
 * small indeterminate bar runs while the app settles. After the intro it fades
 * out and calls `onFinish` so the parent can unmount it.
 *
 * Pure React Native `Animated` — no extra dependency, native driver on
 * everything that can use it.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';

const NAVY = '#0D2B6B';
const ROYAL = '#1E88E5';
const YELLOW = '#FFD600';
const SLATE = '#475569';
const SKY = '#BAE6FD';

export default function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const fade = useRef(new Animated.Value(1)).current;
  const crest = useRef(new Animated.Value(0)).current;
  const ringPulse = useRef(new Animated.Value(0)).current;
  const ringSpin = useRef(new Animated.Value(0)).current;
  const scan = useRef(new Animated.Value(0)).current;
  const title = useRef(new Animated.Value(0)).current;
  const subtitle = useRef(new Animated.Value(0)).current;
  const pill = useRef(new Animated.Value(0)).current;
  const footer = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;

  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;

  useEffect(() => {
    const spinLoop = Animated.loop(
      Animated.timing(ringSpin, {
        toValue: 1,
        duration: 6000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(ringPulse, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(ringPulse, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    const scanLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(scan, {
          toValue: 1,
          duration: 1900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scan, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(420),
      ])
    );
    const shimmerLoop = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1500,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    );

    spinLoop.start();
    pulseLoop.start();
    scanLoop.start();
    shimmerLoop.start();

    const intro = Animated.parallel([
      Animated.timing(crest, {
        toValue: 1,
        duration: 620,
        easing: Easing.out(Easing.back(1.3)),
        useNativeDriver: true,
      }),
      Animated.timing(title, {
        toValue: 1,
        duration: 460,
        delay: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(subtitle, {
        toValue: 1,
        duration: 460,
        delay: 380,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(pill, {
        toValue: 1,
        duration: 460,
        delay: 500,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(footer, {
        toValue: 1,
        duration: 520,
        delay: 620,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]);

    const out = Animated.timing(fade, {
      toValue: 0,
      duration: 420,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    });

    Animated.sequence([intro, Animated.delay(1250), out]).start(({ finished }) => {
      if (finished) finishRef.current();
    });

    return () => {
      spinLoop.stop();
      pulseLoop.stop();
      scanLoop.stop();
      shimmerLoop.stop();
      crest.stopAnimation();
      title.stopAnimation();
      subtitle.stopAnimation();
      pill.stopAnimation();
      footer.stopAnimation();
      fade.stopAnimation();
    };
  }, [crest, fade, footer, pill, ringPulse, ringSpin, scan, shimmer, subtitle, title]);

  const version = Constants.expoConfig?.version ?? '1.4.21';

  const rise = (value: Animated.Value, distance = 14) => ({
    opacity: value,
    transform: [
      {
        translateY: value.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }),
      },
    ],
  });

  return (
    <Animated.View style={[styles.root, { opacity: fade }]} pointerEvents="auto">
      <View style={styles.glow} pointerEvents="none" />

      <View style={styles.center}>
        <View style={styles.crestStage}>
          {/* Soft outer halo */}
          <Animated.View
            style={[
              styles.outerRing,
              {
                opacity: ringPulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0.45] }),
                transform: [
                  {
                    scale: ringPulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.97, 1.04],
                    }),
                  },
                ],
              },
            ]}
            pointerEvents="none"
          />
          {/* Spinning gold arc */}
          <Animated.View
            style={[
              styles.arc,
              {
                transform: [
                  {
                    rotate: ringSpin.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '360deg'],
                    }),
                  },
                ],
              },
            ]}
            pointerEvents="none"
          />

          <Animated.View
            style={[
              styles.crestBox,
              {
                opacity: crest,
                transform: [
                  {
                    scale: crest.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.82, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <Image
              source={require('../assets/sps.png')}
              style={styles.crest}
              resizeMode="contain"
            />
            {/* Scanning line sweeping the crest */}
            <Animated.View
              style={[
                styles.scanLine,
                {
                  transform: [
                    {
                      translateY: scan.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-62, 62],
                      }),
                    },
                  ],
                },
              ]}
              pointerEvents="none"
            />
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </Animated.View>
        </View>

        <Animated.Text style={[styles.title, rise(title, 12)]}>SPSC Attendance</Animated.Text>
        <Animated.Text style={[styles.subtitle, rise(subtitle, 10)]}>
          Smart Biometric Attendance System
        </Animated.Text>

        <Animated.View style={[styles.pill, rise(pill, 8)]}>
          <View style={styles.pillDot} />
          <Text style={styles.pillText}>WISDOM • DISCIPLINE • LEADERSHIP</Text>
        </Animated.View>
      </View>

      <Animated.View style={[styles.footer, { opacity: footer }]}>
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressBar,
              {
                transform: [
                  {
                    translateX: shimmer.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-70, 176],
                    }),
                  },
                ],
              },
            ]}
          />
        </View>
        <Text style={styles.features}>Secure  •  Fast  •  Accurate</Text>
        <Text style={styles.school}>Sialkot Public School &amp; College</Text>
        <Text style={styles.version}>v{version} • SPS IT Department</Text>
      </Animated.View>
    </Animated.View>
  );
}

const STAGE = 208;

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 96,
    paddingBottom: 46,
    zIndex: 200,
    elevation: 200,
  },
  glow: {
    position: 'absolute',
    top: 60,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: '#EFF6FF',
    opacity: 0.9,
  },
  center: { alignItems: 'center', paddingHorizontal: 24 },
  crestStage: {
    width: STAGE,
    height: STAGE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
  },
  outerRing: {
    position: 'absolute',
    width: STAGE - 6,
    height: STAGE - 6,
    borderRadius: (STAGE - 6) / 2,
    borderWidth: 1,
    borderColor: SKY,
  },
  arc: {
    position: 'absolute',
    width: STAGE - 34,
    height: STAGE - 34,
    borderRadius: (STAGE - 34) / 2,
    borderWidth: 2,
    borderColor: 'transparent',
    borderTopColor: YELLOW,
    borderRightColor: 'rgba(255,214,0,0.35)',
  },
  crestBox: {
    width: 178,
    height: 178,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    // transparent on purpose: the crest PNG has a transparent background
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  crest: { width: 138, height: (138 * 249) / 203 },
  scanLine: {
    position: 'absolute',
    width: 150,
    height: 2,
    borderRadius: 2,
    backgroundColor: YELLOW,
    shadowColor: YELLOW,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  corner: { position: 'absolute', width: 14, height: 14, borderColor: ROYAL },
  cornerTL: { top: 4, left: 4, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 4 },
  cornerTR: { top: 4, right: 4, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 4 },
  cornerBL: { bottom: 4, left: 4, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 4 },
  cornerBR: {
    bottom: 4,
    right: 4,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderBottomRightRadius: 4,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.6,
    color: NAVY,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 7,
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.2,
    color: SLATE,
    textAlign: 'center',
  },
  pill: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  pillDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: ROYAL },
  pillText: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: NAVY,
  },
  footer: { alignItems: 'center', gap: 6 },
  progressTrack: {
    width: 176,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    width: 70,
    height: '100%',
    borderRadius: 999,
    backgroundColor: ROYAL,
  },
  features: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    color: '#64748B',
  },
  school: {
    marginTop: 6,
    fontSize: 11.5,
    fontWeight: '600',
    letterSpacing: 0.3,
    color: '#334155',
  },
  version: { fontSize: 9.5, letterSpacing: 0.5, color: '#94A3B8' },
});
