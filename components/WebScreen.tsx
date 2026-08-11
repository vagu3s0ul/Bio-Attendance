/**
 * WebView wrapper used for the data-heavy PHP pages (entry, reports, audit,
 * manage, export). The embedded page keeps the PHP session because we seed the
 * native cookie store before loading (see services/cookies.ts) and, as a
 * fallback, pass the Cookie header on the initial request.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { COLORS, RADIUS } from '@/constants/theme';
import { getCookie, MOBILE_UA } from '@/services/settings';
import { syncWebViewCookies } from '@/services/cookies';

export default function WebScreen({
  uri,
  onOpenExternal,
}: {
  uri: string;
  onOpenExternal?: (url: string) => void;
}) {
  const [cookie, setCookie] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const ok = await syncWebViewCookies();
      const c = await getCookie();
      if (active) {
        setSeeded(ok);
        setCookie(c);
        setFailed(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [uri]);

  const openExternal = useCallback(() => {
    Linking.openURL(uri).catch(() => undefined);
    onOpenExternal?.(uri);
  }, [uri, onOpenExternal]);

  if (failed) {
    return (
      <View style={styles.center}>
        <Text style={styles.failTitle}>Couldn't load this page</Text>
        <Text style={styles.failBody}>
          Check your connection, then retry — or open the page in your browser.
        </Text>
        <Pressable style={styles.retryBtn} onPress={() => setFailed(false)}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
        <Pressable style={styles.extBtn} onPress={openExternal}>
          <Text style={styles.extText}>Open in browser</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <WebView
        key={uri}
        source={{ uri, headers: cookie ? { Cookie: cookie } : undefined }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        )}
        onError={() => setFailed(true)}
        onHttpError={(s) => {
          if (s.nativeEvent.statusCode >= 500) setFailed(true);
        }}
        style={styles.webview}
      />
      {!seeded ? (
        <View style={styles.hint}>
          <Text style={styles.hintText}>
            Full web mode — links & forms inside may ask you to log in if the
            session can't sync (dev builds keep it signed in automatically).
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.background },
  webview: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: COLORS.background },
  failTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  failBody: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  retryBtn: {
    marginTop: 18,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 26,
    paddingVertical: 11,
  },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  extBtn: { marginTop: 10, padding: 8 },
  extText: { color: COLORS.primary, fontSize: 14, fontWeight: '600' },
  hint: {
    backgroundColor: COLORS.warningBg,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  hintText: { color: COLORS.warningText, fontSize: 11, lineHeight: 15 },
});
