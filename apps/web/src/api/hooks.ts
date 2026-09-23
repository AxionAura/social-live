import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import type {
  AuditLogEntry,
  DashboardData,
  Destination,
  DiagnosticCheck,
  SafeUser,
  Stream,
  StreamLogEntry,
  SystemInfo,
  Video,
} from '@social-live/shared';
import { api } from './client.js';

export interface AuthStatus {
  needsSetup: boolean;
  user: SafeUser | null;
}

export function useAuthStatus() {
  return useQuery({
    queryKey: ['auth', 'status'],
    queryFn: () => api.get<AuthStatus>('/api/auth/status'),
    staleTime: 30_000,
  });
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/api/dashboard'),
  });
}

export interface VideoListParams {
  search?: string;
  sort?: string;
  order?: string;
  page?: number;
  pageSize?: number;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function useVideos(params: VideoListParams) {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.sort) query.set('sort', params.sort);
  if (params.order) query.set('order', params.order);
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  return useQuery({
    queryKey: ['videos', params],
    queryFn: () => api.get<Paged<Video>>(`/api/videos?${query.toString()}`),
    placeholderData: keepPreviousData,
  });
}

export function useAllVideos() {
  return useQuery({
    queryKey: ['videos', 'all-ready'],
    queryFn: () => api.get<Paged<Video>>('/api/videos?pageSize=100&sort=created_at&order=DESC'),
  });
}

export function useDestinations() {
  return useQuery({
    queryKey: ['destinations'],
    queryFn: () => api.get<{ items: Destination[] }>('/api/destinations'),
  });
}

export interface StreamListParams {
  status?: string;
  platform?: string;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export function useStreams(params: StreamListParams) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '' && value !== 'ALL') query.set(key, String(value));
  }
  return useQuery({
    queryKey: ['streams', params],
    queryFn: () => api.get<Paged<Stream>>(`/api/streams?${query.toString()}`),
    placeholderData: keepPreviousData,
  });
}

export function useStream(id: string | undefined) {
  return useQuery({
    queryKey: ['stream', id],
    queryFn: () => api.get<Stream>(`/api/streams/${id}`),
    enabled: Boolean(id),
  });
}

export function useStreamLogs(id: string | undefined, active: boolean) {
  return useQuery({
    queryKey: ['logs', id],
    queryFn: () => api.get<{ items: StreamLogEntry[] }>(`/api/streams/${id}/logs`),
    enabled: Boolean(id),
    refetchInterval: active ? 5_000 : false,
  });
}

export function useSystemInfo() {
  return useQuery({
    queryKey: ['system', 'info'],
    queryFn: () => api.get<SystemInfo>('/api/system/info'),
    staleTime: 60_000,
  });
}

export function useDiagnostics() {
  return useQuery({
    queryKey: ['system', 'diagnostics'],
    queryFn: () => api.get<{ items: DiagnosticCheck[] }>('/api/system/diagnostics'),
  });
}

export function useAuditLog(limit = 100) {
  return useQuery({
    queryKey: ['audit', limit],
    queryFn: () => api.get<{ items: AuditLogEntry[] }>(`/api/audit?limit=${limit}`),
  });
}

export function useInvalidate() {
  const queryClient = useQueryClient();
  return (...keys: string[]) => {
    for (const key of keys) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  };
}
