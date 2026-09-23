import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { ServerEvent } from '@social-live/shared';
import { ThemeModeProvider } from './providers/ThemeModeProvider.js';
import { NotificationsProvider, useNotifications } from './providers/NotificationsProvider.js';
import { AuthProvider } from './providers/AuthProvider.js';
import { AuthGuard, GuestGuard, Layout } from './components/Layout.js';
import { useSSE } from './hooks/useSSE.js';
import LoginPage from './pages/LoginPage.js';
import SetupPage from './pages/SetupPage.js';
import DashboardPage from './pages/DashboardPage.js';
import StreamsPage from './pages/StreamsPage.js';
import StreamDetailPage from './pages/StreamDetailPage.js';
import StreamWizardPage from './pages/StreamWizardPage.js';
import VideosPage from './pages/VideosPage.js';
import DestinationsPage from './pages/DestinationsPage.js';
import HistoryPage from './pages/HistoryPage.js';
import SettingsPage from './pages/SettingsPage.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/** Bridges server-sent events into the query cache and notifications. */
function SSEBridge() {
  const localQueryClient = useQueryClient();
  const { notify } = useNotifications();

  useSSE((event: ServerEvent) => {
    const data = event.data as {
      id?: string;
      streamId?: string;
      message?: string;
      attempt?: number;
    } | null;
    const streamId = data?.streamId ?? data?.id ?? null;

    switch (event.type) {
      case 'stream.starting':
      case 'stream.started':
      case 'stream.status':
        void localQueryClient.invalidateQueries({ queryKey: ['streams'] });
        void localQueryClient.invalidateQueries({ queryKey: ['dashboard'] });
        if (streamId) void localQueryClient.invalidateQueries({ queryKey: ['stream', streamId] });
        if (event.type === 'stream.started') notify('success', 'Stream is live');
        break;
      case 'stream.reconnecting':
        if (streamId) void localQueryClient.invalidateQueries({ queryKey: ['stream', streamId] });
        void localQueryClient.invalidateQueries({ queryKey: ['streams'] });
        notify('warning', data?.message ?? `Reconnecting (attempt ${data?.attempt ?? 1})…`);
        break;
      case 'stream.error':
        if (streamId) void localQueryClient.invalidateQueries({ queryKey: ['stream', streamId] });
        void localQueryClient.invalidateQueries({ queryKey: ['streams'] });
        void localQueryClient.invalidateQueries({ queryKey: ['dashboard'] });
        if (data?.message) notify('error', data.message);
        break;
      case 'stream.stopped':
      case 'stream.completed':
        void localQueryClient.invalidateQueries();
        notify(
          event.type === 'stream.completed' ? 'success' : 'info',
          event.type === 'stream.completed' ? 'Stream completed' : 'Stream stopped',
        );
        break;
      case 'stream.created':
      case 'stream.deleted':
        void localQueryClient.invalidateQueries({ queryKey: ['streams'] });
        void localQueryClient.invalidateQueries({ queryKey: ['dashboard'] });
        break;
      case 'video.created':
      case 'video.updated':
      case 'video.deleted':
        void localQueryClient.invalidateQueries({ queryKey: ['videos'] });
        void localQueryClient.invalidateQueries({ queryKey: ['dashboard'] });
        break;
      case 'destination.created':
      case 'destination.updated':
      case 'destination.deleted':
        void localQueryClient.invalidateQueries({ queryKey: ['destinations'] });
        void localQueryClient.invalidateQueries({ queryKey: ['dashboard'] });
        break;
      default:
        break;
    }
  });
  return null;
}

function AuthenticatedRoutes() {
  return (
    <Routes>
      <Route index element={<DashboardPage />} />
      <Route path="streams" element={<StreamsPage />} />
      <Route path="streams/new" element={<StreamWizardPage />} />
      <Route path="streams/:id" element={<StreamDetailPage />} />
      <Route path="videos" element={<VideosPage />} />
      <Route path="destinations" element={<DestinationsPage />} />
      <Route path="history" element={<HistoryPage />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeModeProvider>
        <NotificationsProvider>
          <AuthProvider>
            <BrowserRouter>
              <Routes>
                <Route
                  path="/login"
                  element={
                    <GuestGuard page="login">
                      <LoginPage />
                    </GuestGuard>
                  }
                />
                <Route
                  path="/setup"
                  element={
                    <GuestGuard page="setup">
                      <SetupPage />
                    </GuestGuard>
                  }
                />
                <Route
                  element={
                    <AuthGuard />
                  }
                >
                  <Route
                    element={
                      <>
                        <SSEBridge />
                        <Layout />
                      </>
                    }
                  >
                    <Route path="*" element={<AuthenticatedRoutes />} />
                  </Route>
                </Route>
              </Routes>
            </BrowserRouter>
          </AuthProvider>
        </NotificationsProvider>
      </ThemeModeProvider>
    </QueryClientProvider>
  );
}
