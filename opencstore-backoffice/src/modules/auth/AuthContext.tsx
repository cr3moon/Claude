import React, { createContext, useContext, useEffect, useState } from 'react';

export type AppMode = 'loading' | 'onboarding' | 'login' | 'app';

export interface AuthUser {
  id:           string;
  username:     string;
  display_name: string;
  role:         'owner' | 'manager' | 'cashier';
}

interface AuthContextValue {
  user:    AuthUser | null;
  appMode: AppMode;
  login:   (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout:  () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [appMode, setAppMode] = useState<AppMode>('loading');

  useEffect(() => {
    (async () => {
      try {
        const state = await window.electronAPI.getOnboardingState();
        if (!state?.completed) {
          setAppMode('onboarding');
          return;
        }
        const me = await window.electronAPI.getCurrentUser?.();
        if (me) {
          setUser(me as AuthUser);
          setAppMode('app');
        } else {
          setAppMode('login');
        }
      } catch {
        setAppMode('login');
      }
    })();
  }, []);

  async function login(username: string, password: string) {
    try {
      const result = await window.electronAPI.login(username, password) as
        { ok: boolean; user?: AuthUser; error?: string };
      if (result.ok && result.user) {
        setUser(result.user);
        setAppMode('app');
      }
      return { ok: result.ok, error: result.error };
    } catch (err: unknown) {
      return { ok: false, error: String(err) };
    }
  }

  async function logout() {
    await window.electronAPI.logout?.();
    setUser(null);
    setAppMode('login');
  }

  return (
    <AuthContext.Provider value={{ user, appMode, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
