/**
 * Session state: React context + SecureStore persistence.
 * Keeps the app in sync with the PHP session (cookie + role).
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { getUser, setUser, clearCookie } from '@/services/settings';
import { logout as apiLogout } from '@/services/api';
import { clearWebViewCookies, syncWebViewCookies } from '@/services/cookies';
import { SessionUser } from '@/types';

interface SessionContextValue {
  user: SessionUser | null;
  ready: boolean;
  signIn: (user: SessionUser) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  user: null,
  ready: false,
  signIn: async () => {},
  signOut: async () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await SplashScreen.preventAutoHideAsync();
      } catch {
        // already hidden
      }
      const u = await getUser();
      if (!active) return;
      setUserState(u);
      if (u) {
        // Best effort: keep WebView sessions alive from the very first screen.
        await syncWebViewCookies();
      }
      if (!active) return;
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (next: SessionUser) => {
    await setUser(next);
    await syncWebViewCookies();
    setUserState(next);
  }, []);

  const signOut = useCallback(async () => {
    await apiLogout();
    await clearCookie();
    await clearWebViewCookies();
    setUserState(null);
  }, []);

  const value = useMemo(
    () => ({ user, ready, signIn, signOut }),
    [user, ready, signIn, signOut]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
