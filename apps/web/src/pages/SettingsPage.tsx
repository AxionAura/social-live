import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Refresh from '@mui/icons-material/Refresh';
import type { Stream } from '@social-live/shared';
import { api, ApiError } from '../api/client.js';
import { useAuditLog, useDiagnostics, useSystemInfo } from '../api/hooks.js';
import { OkDetail } from '../components/ui.js';
import { formatBytes, formatDateTime } from '../lib/format.js';
import { useAuth } from '../providers/AuthProvider.js';
import { useNotifications } from '../providers/NotificationsProvider.js';

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h6">{title}</Typography>
        {subtitle ? (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {subtitle}
          </Typography>
        ) : (
          <Box sx={{ mb: 2 }} />
        )}
        {children}
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { notify } = useNotifications();
  const systemQuery = useSystemInfo();
  const diagnosticsQuery = useDiagnostics();
  const auditQuery = useAuditLog(50);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const changePassword = useMutation({
    mutationFn: () => api.post('/api/auth/password', { currentPassword, newPassword }),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordError(null);
      notify('success', 'Password changed. Other sessions were signed out.');
    },
    onError: (error) =>
      setPasswordError(error instanceof ApiError ? error.message : 'Could not change the password'),
  });

  function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }
    changePassword.mutate();
  }

  const system = systemQuery.data;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5">Settings</Typography>
        <Typography variant="body2" color="text.secondary">
          Account, system and diagnostics
        </Typography>
      </Box>

      <SectionCard title="Account" subtitle="Local administrator of this installation.">
        <Stack spacing={2} sx={{ maxWidth: 480 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2">Signed in as</Typography>
            <Chip label={user?.username ?? '—'} color="primary" variant="outlined" />
            {user?.email ? (
              <Typography variant="body2" color="text.secondary">
                {user.email}
              </Typography>
            ) : null}
          </Stack>
          <Divider />
          <form onSubmit={handlePasswordSubmit}>
            <Stack spacing={2}>
              {passwordError ? <Alert severity="error">{passwordError}</Alert> : null}
              <TextField
                label="Current password"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                required
                fullWidth
              />
              <TextField
                label="New password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                required
                fullWidth
              />
              <TextField
                label="Confirm new password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                required
                fullWidth
                error={Boolean(passwordError && newPassword !== confirmPassword)}
              />
              <Button type="submit" variant="contained" sx={{ alignSelf: 'flex-start' }} disabled={changePassword.isPending}>
                {changePassword.isPending ? 'Changing…' : 'Change password'}
              </Button>
            </Stack>
          </form>
        </Stack>
      </SectionCard>

      <SectionCard title="System" subtitle="Environment detected by the server.">
        <Grid container spacing={2} columns={{ xs: 4, md: 12 }}>
          {system
            ? [
                ['Version', `${system.name} ${system.version}`],
                ['Node.js', system.nodeVersion],
                ['Platform', system.platform],
                ['Data directory', system.dataDir],
                ['FFmpeg', system.ffmpegPath ? `${system.ffmpegPath} (${system.ffmpegVersion ?? '?'})` : 'not found'],
                ['FFprobe', system.ffprobePath ?? 'not found'],
                ['Max upload size', formatBytes(system.maxUploadSize)],
                ['Max concurrent streams', String(system.maxConcurrentStreams)],
              ].map(([label, value]) => (
                <Grid key={label} size={{ xs: 4, md: 6 }}>
                  <Typography variant="overline" display="block" color="text.secondary">
                    {label}
                  </Typography>
                  <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                    {value}
                  </Typography>
                </Grid>
              ))
            : (
              <Grid size={12}>
                <Typography variant="body2" color="text.secondary">
                  Loading system info…
                </Typography>
              </Grid>
            )}
        </Grid>
      </SectionCard>

      <SectionCard
        title="Diagnostics"
        subtitle="Self-hosted health check. Failed items include a hint."
      >
        <Stack spacing={1.5}>
          <Button
            startIcon={<Refresh />}
            onClick={() => void diagnosticsQuery.refetch()}
            sx={{ alignSelf: 'flex-start' }}
            disabled={diagnosticsQuery.isFetching}
          >
            {diagnosticsQuery.isFetching ? 'Running…' : 'Run again'}
          </Button>
          {(diagnosticsQuery.data?.items ?? []).map((check) => (
            <Box key={check.name}>
              <OkDetail ok={check.ok}>{check.detail}</OkDetail>
              {!check.ok && check.hint ? (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 3.5 }}>
                  {check.hint}
                </Typography>
              ) : null}
            </Box>
          ))}
        </Stack>
      </SectionCard>

      <SectionCard title="Audit log" subtitle="Security-relevant events on this installation.">
        <Stack divider={<Divider flexItem />} spacing={1}>
          {(auditQuery.data?.items ?? []).map((entry) => (
            <Stack key={entry.id} direction="row" spacing={2} alignItems="baseline" useFlexGap flexWrap="wrap">
              <Typography variant="caption" sx={{ width: 150, flexShrink: 0 }} color="text.secondary">
                {formatDateTime(entry.createdAt)}
              </Typography>
              <Chip size="small" label={entry.action} variant="outlined" sx={{ height: 22 }} />
              {entry.detail ? (
                <Typography variant="body2">{entry.detail}</Typography>
              ) : null}
              {entry.ip ? (
                <Typography variant="caption" color="text.disabled">
                  {entry.ip}
                </Typography>
              ) : null}
            </Stack>
          ))}
          {auditQuery.data && auditQuery.data.items.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No audit entries yet.
            </Typography>
          ) : null}
        </Stack>
      </SectionCard>
    </Stack>
  );
}
