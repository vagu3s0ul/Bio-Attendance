import React from 'react';
import { Redirect } from 'expo-router';
import { useSession } from '@/store/session';
import type { Role } from '@/types';

/**
 * Client-side role gate for admin-only routes (manage screens, audit, etc.).
 * A teacher has no UI path to these screens; this also blocks direct
 * deep links. Server-side enforcement still lives in the PHP app.
 */
export default function AdminOnly({
  children,
  allow = ['admin'],
}: {
  children: React.ReactNode;
  allow?: Role[];
}) {
  const { user, ready } = useSession();
  if (!ready) return null; // session still restoring
  if (!user) return <Redirect href="/(auth)/login" />;
  if (!allow.includes(user.role)) return <Redirect href="/(tabs)" />;
  return <>{children}</>;
}
