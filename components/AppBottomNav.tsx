import React, { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'expo-router';
import BottomNav from '@/components/BottomNav';
import { fetchNotices } from '@/services/api';
import { useSession } from '@/store/session';

const ACTIVE_BY_PATH: Record<string, string> = {
  '/': 'home',
  '/entry': 'entry',
  '/reports': 'reports',
  '/notices': 'notices',
  '/settings': 'more',
};

export default function AppBottomNav() {
  const pathname = usePathname();
  const { user } = useSession();
  const [unread, setUnread] = useState(0);

  const loadUnread = useCallback(async () => {
    try {
      const notices = await fetchNotices();
      setUnread(notices.filter((n) => !n.read).length);
    } catch {
      // badge is cosmetic; ignore auth/network failures
    }
  }, []);

  useEffect(() => {
    loadUnread();
  }, [loadUnread, pathname === '/notices']);

  if (pathname === '/login') return null;

  // The Principal's (and Section Head's) home already carries its own
  // Overview · Attendance · Classes · Notices · Reckoner bar — showing the
  // global tab deck underneath it would stack two navigations on one screen.
  if (pathname === '/' && (user?.role === 'principal' || user?.role === 'section_head')) {
    return null;
  }

  return <BottomNav flow active={ACTIVE_BY_PATH[pathname] ?? 'more'} notices={unread} />;
}
