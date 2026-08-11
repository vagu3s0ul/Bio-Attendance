import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, useLocalSearchParams, useNavigation } from 'expo-router';
import WebScreen from '@/components/WebScreen';
import { pageTitle, pageUri } from '@/services/api';
import { useSession } from '@/store/session';

/** Admin-only PHP pages (teachers get bounced to their dashboard). */
const ADMIN_ONLY = new Set(['audit', 'manage']);

export default function WebPage() {
  const { page } = useLocalSearchParams<{ page: string }>();
  const slug = page || 'dashboard';
  const navigation = useNavigation();
  const { user, ready } = useSession();
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: pageTitle(slug) });
  }, [navigation, slug]);

  useEffect(() => {
    if (ADMIN_ONLY.has(slug) && user?.role !== 'admin') return; // guard, don't fetch
    pageUri(slug).then(setUri);
  }, [slug, user?.role]);

  if (!ready) return <View style={{ flex: 1 }} />;
  if (!user) return <Redirect href="/(auth)/login" />;
  if (ADMIN_ONLY.has(slug) && user.role !== 'admin') {
    return <Redirect href="/(tabs)" />;
  }

  if (!uri) return <View style={{ flex: 1 }} />;
  return <WebScreen uri={uri} />;
}
