import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SafeUser } from '@social-live/shared';
import { api } from '../api/client.js';
import { useAuthStatus, type AuthStatus } from '../api/hooks.js';

interface AuthContextValue {
  loading: boolean;
  needsSetup: boolean;
  user: SafeUser | null;
  login: (username: string, password: string) => Promise<void>;
  setup: (input: { username: string; email?: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  loading: true,
  needsSetup: false,
  user: null,
  login: async () => {},
  setup: async () => {},
  logout: async () => {},
  refresh: async () => {},
});

/**
 * Replace every cached query except the live auth-status query.
 *
 * Never call queryClient.clear() here while auth observers are mounted:
 * clear() destroys the query objects the mounted hooks are subscribed to,
 * so the UI stops receiving updates entirely. removeQueries() with a
 * predicate keeps the auth query (and its observers) intact.
 */
function resetCacheKeepingAuth(queryClient: ReturnType<typeof useQueryClient>, status: AuthStatus): void {
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
  queryClient.setQueryData<AuthStatus>(['auth', 'status'], status);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const query = useAuthStatus();
  const queryClient = useQueryClient();

  const login = useCallback(
    async (username: string, password: string) => {
      const { user } = await api.post<{ user: SafeUser }>('/api/auth/login', { username, password });
      resetCacheKeepingAuth(queryClient, { needsSetup: false, user });
    },
    [queryClient],
  );

  const setup = useCallback(
    async (input: { username: string; email?: string; password: string }) => {
      const { user } = await api.post<{ user: SafeUser }>('/api/auth/setup', {
        username: input.username,
        email: input.email ?? '',
        password: input.password,
      });
      resetCacheKeepingAuth(queryClient, { needsSetup: false, user });
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout');
    resetCacheKeepingAuth(queryClient, { needsSetup: false, user: null });
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading: query.isLoading,
      needsSetup: query.data?.needsSetup ?? false,
      user: query.data?.user ?? null,
      login,
      setup,
      logout,
      refresh: async () => {
        await query.refetch();
      },
    }),
    [query, login, setup, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
