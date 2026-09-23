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

export function AuthProvider({ children }: { children: ReactNode }) {
  const query = useAuthStatus();
  const queryClient = useQueryClient();

  const apply = useCallback(
    (status: AuthStatus) => {
      queryClient.setQueryData(['auth', 'status'], status);
    },
    [queryClient],
  );

  const login = useCallback(
    async (username: string, password: string) => {
      await api.post<{ user: SafeUser }>('/api/auth/login', { username, password });
      await queryClient.invalidateQueries();
      apply({ needsSetup: false, user: null }); // will be replaced by refreshed status
    },
    [apply, queryClient],
  );

  const setup = useCallback(
    async (input: { username: string; email?: string; password: string }) => {
      const { user } = await api.post<{ user: SafeUser }>('/api/auth/setup', {
        username: input.username,
        email: input.email ?? '',
        password: input.password,
      });
      apply({ needsSetup: false, user });
    },
    [apply],
  );

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout');
    queryClient.clear();
    apply({ needsSetup: false, user: null });
    await queryClient.invalidateQueries();
  }, [apply, queryClient]);

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
