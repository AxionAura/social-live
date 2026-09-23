import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';

export type NotificationSeverity = 'success' | 'info' | 'warning' | 'error';

export interface AppNotification {
  id: number;
  severity: NotificationSeverity;
  message: string;
  ts: string;
}

interface NotificationsContextValue {
  notify: (severity: NotificationSeverity, message: string) => void;
  recent: AppNotification[];
  clear: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue>({
  notify: () => {},
  recent: [],
  clear: () => {},
});

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [recent, setRecent] = useState<AppNotification[]>([]);
  const [current, setCurrent] = useState<(AppNotification & { key: number }) | null>(null);
  const counter = useRef(0);

  const notify = useCallback((severity: NotificationSeverity, message: string) => {
    counter.current += 1;
    const notification: AppNotification & { key: number } = {
      id: counter.current,
      key: counter.current,
      severity,
      message,
      ts: new Date().toISOString(),
    };
    setRecent((prev) => [notification, ...prev].slice(0, 20));
    setCurrent(notification);
  }, []);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      notify,
      recent,
      clear: () => setRecent([]),
    }),
    [notify, recent],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <Snackbar
        key={current?.key}
        open={Boolean(current)}
        autoHideDuration={5_000}
        onClose={() => setCurrent(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {current ? (
          <Alert
            severity={current.severity}
            variant="filled"
            onClose={() => setCurrent(null)}
            sx={{ minWidth: 280 }}
          >
            {current.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  return useContext(NotificationsContext);
}
