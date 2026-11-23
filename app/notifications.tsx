import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import Screen from '@/components/Screen';
import AppBar from '@/components/AppBar';
import Card from '@/components/Card';
import { COLORS, FONT, RADIUS, SPACING } from '@/constants/theme';
import {
  AppNotification,
  fetchNotifications,
  openNotificationTarget,
} from '@/services/notifications';

export default function NotificationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchNotifications());
    } catch (e: any) {
      Alert.alert("Couldn't load notifications", e?.message || 'Check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Screen>
      <AppBar showBell={false} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Notifications</Text>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : items.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyText}>No notifications yet.</Text>
          </Card>
        ) : (
          items.map((n) => (
            <Card key={String(n.id)} style={styles.card}>
              {n.image ? (
                <Image source={{ uri: n.image }} style={styles.image} resizeMode="cover" />
              ) : null}
              <Text style={styles.itemTitle}>{n.title}</Text>
              <Text style={styles.itemBody}>{n.body}</Text>
              {n.created_at ? (
                <Text style={styles.itemMeta}>{n.created_at}</Text>
              ) : null}
              <View style={styles.actions}>
                {n.link ? (
                  <Pressable
                    style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
                    onPress={() => openNotificationTarget(n.link)}
                  >
                    <Ionicons name="link-outline" size={16} color={COLORS.primary} />
                    <Text style={styles.actionText}>Open link</Text>
                  </Pressable>
                ) : null}
                {n.attachment ? (
                  <Pressable
                    style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
                    onPress={() => openNotificationTarget(n.attachment)}
                  >
                    <Ionicons name="document-attach-outline" size={16} color={COLORS.primary} />
                    <Text style={styles.actionText}>Open file</Text>
                  </Pressable>
                ) : null}
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: SPACING.lg, paddingTop: 0, paddingBottom: 40, gap: SPACING.md },
  title: { fontSize: 20, fontFamily: FONT.display, fontWeight: '300', color: COLORS.text, marginBottom: 4 },
  center: { paddingVertical: 40, alignItems: 'center' },
  emptyCard: { padding: SPACING.xl, alignItems: 'center' },
  emptyText: { color: COLORS.textMuted, fontFamily: FONT.regular },
  card: { gap: 8 },
  image: { width: '100%', height: 160, borderRadius: RADIUS.md, backgroundColor: COLORS.field },
  itemTitle: { fontSize: 13.5, fontFamily: FONT.regular, fontWeight: '400', color: COLORS.text },
  itemBody: { fontSize: 13, color: COLORS.text, fontFamily: FONT.regular, lineHeight: 19 },
  itemMeta: { fontSize: 11, color: COLORS.textMuted, fontFamily: FONT.regular },
  actions: { flexDirection: 'row', gap: SPACING.md, marginTop: 4 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.chipIdle,
  },
  actionText: { fontSize: 13, fontFamily: FONT.regular, fontWeight: '400', color: COLORS.primary },
  pressed: { opacity: 0.85 },
});
