import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Link,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import ContentCopy from '@mui/icons-material/ContentCopy';
import Delete from '@mui/icons-material/Delete';
import Edit from '@mui/icons-material/Edit';
import NetworkCheck from '@mui/icons-material/NetworkCheck';
import Visibility from '@mui/icons-material/Visibility';
import type { Destination, Platform } from '@social-live/shared';
import { PLATFORM_META } from '@social-live/shared';
import { api, ApiError } from '../api/client.js';
import { useDestinations } from '../api/hooks.js';
import { ConfirmDialog, EmptyState, PlatformIcon } from '../components/ui.js';
import { useNotifications } from '../providers/NotificationsProvider.js';

interface DestinationFormState {
  platform: Platform;
  name: string;
  streamKey: string;
  streamUrl: string;
}

const emptyForm: DestinationFormState = {
  platform: 'youtube',
  name: '',
  streamKey: '',
  streamUrl: '',
};

export default function DestinationsPage() {
  const queryClient = useQueryClient();
  const { notify } = useNotifications();
  const { data, isLoading } = useDestinations();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DestinationFormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Destination | null>(null);
  const [revealed, setRevealed] = useState<{ destination: Destination; key: string } | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['destinations'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }

  const save = useMutation({
    mutationFn: (input: DestinationFormState & { id: string | null }) => {
      if (input.id) {
        return api.patch<Destination>(`/api/destinations/${input.id}`, {
          name: input.name,
          streamKey: input.streamKey || undefined,
          streamUrl: input.streamUrl,
        });
      }
      return api.post<Destination>('/api/destinations', {
        platform: input.platform,
        name: input.name,
        streamKey: input.streamKey,
        streamUrl: input.streamUrl,
      });
    },
    onSuccess: () => {
      setFormOpen(false);
      setFormError(null);
      refresh();
      notify('success', 'Destination saved');
    },
    onError: (error) => setFormError(error instanceof ApiError ? error.message : 'Failed to save destination'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/destinations/${id}`),
    onSuccess: () => {
      setDeleteTarget(null);
      refresh();
    },
  });

  const reveal = useMutation({
    mutationFn: (destination: Destination) =>
      api.post<{ streamKey: string }>(`/api/destinations/${destination.id}/reveal`),
    onSuccess: ({ streamKey }, destination) => setRevealed({ destination, key: streamKey }),
  });

  const test = useMutation({
    mutationFn: (destination: Destination) =>
      api.post<{ ok: boolean; latencyMs: number | null; host: string; port: number }>(
        `/api/destinations/${destination.id}/test`,
      ),
    onSuccess: (result, destination) => {
      setTestResult({
        id: destination.id,
        ok: result.ok,
        text: result.ok
          ? `Reachable: ${result.host}:${result.port} (${result.latencyMs} ms)`
          : `Could not reach ${result.host}:${result.port}`,
      });
    },
    onError: (error) => {
      setTestResult({ id: '', ok: false, text: error instanceof ApiError ? error.message : 'Test failed' });
    },
  });

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(destination: Destination) {
    setEditingId(destination.id);
    setForm({
      platform: destination.platform,
      name: destination.name,
      streamKey: '',
      streamUrl: destination.streamUrl ?? PLATFORM_META[destination.platform].defaultIngestUrl,
    });
    setFormError(null);
    setFormOpen(true);
  }

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
        <Box>
          <Typography variant="h5">Destinations</Typography>
          <Typography variant="body2" color="text.secondary">
            Where your videos go live. Credentials are encrypted on your server.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={openCreate}>
          Add Destination
        </Button>
      </Stack>

      {isLoading ? null : !data || data.items.length === 0 ? (
        <EmptyState
          icon={<Add />}
          title="No destinations yet"
          message="Connect YouTube or Facebook with your stream key. The key never leaves your server unencrypted."
          action={
            <Button variant="contained" startIcon={<Add />} onClick={openCreate}>
              Add Destination
            </Button>
          }
        />
      ) : (
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
          }}
        >
          {data.items.map((destination) => {
            const meta = PLATFORM_META[destination.platform];
            return (
              <Card key={destination.id} variant="outlined">
                <CardContent sx={{ display: 'grid', gap: 1.5 }}>
                  <Stack direction="row" alignItems="center" spacing={1.5}>
                    <PlatformIcon platform={destination.platform} size={26} />
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Typography variant="subtitle1" fontWeight={600} noWrap>
                        {destination.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {meta.label}
                      </Typography>
                    </Box>
                    <Chip
                      size="small"
                      color={destination.status === 'CONNECTED' ? 'success' : 'default'}
                      label={destination.status.toLowerCase()}
                      variant="outlined"
                    />
                  </Stack>

                  <Typography variant="caption" color="text.secondary" noWrap title={destination.streamUrl ?? undefined}>
                    Ingest: {destination.streamUrl ?? meta.defaultIngestUrl}
                  </Typography>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography variant="body2" sx={{ letterSpacing: 2 }}>
                      ••••••••••••
                    </Typography>
                    <Tooltip title="Reveal stream key">
                      <IconButton size="small" onClick={() => reveal.mutate(destination)}>
                        <Visibility fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>

                  {testResult && testResult.id === destination.id ? (
                    <Alert severity={testResult.ok ? 'success' : 'error'} sx={{ py: 0.5 }}>
                      {testResult.text}
                    </Alert>
                  ) : null}

                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Button size="small" startIcon={<NetworkCheck />} onClick={() => test.mutate(destination)} disabled={test.isPending}>
                      Test
                    </Button>
                    <Button size="small" onClick={() => openEdit(destination)}>
                      Edit
                    </Button>
                    <IconButton size="small" color="error" onClick={() => setDeleteTarget(destination)} aria-label="Delete destination">
                      <Delete fontSize="small" />
                    </IconButton>
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}

      <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? 'Edit destination' : 'Add destination'}</DialogTitle>
        {/* MUI v7 zeroes the top padding after a DialogTitle; the outlined label needs room. */}
        <DialogContent sx={{ display: 'grid', gap: 2, '&&': { pt: 2 } }}>
          {formError ? <Alert severity="error">{formError}</Alert> : null}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              select
              label="Platform"
              value={form.platform}
              onChange={(event) => setForm({ ...form, platform: event.target.value as Platform })}
              sx={{ width: { sm: 200 }, flexShrink: 0 }}
              disabled={Boolean(editingId)}
            >
              {(Object.keys(PLATFORM_META) as Platform[]).map((platform) => (
                <MenuItem key={platform} value={platform}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <PlatformIcon platform={platform} size={16} />
                    {PLATFORM_META[platform].label}
                  </Stack>
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Name"
              placeholder="e.g. Main channel"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              fullWidth
            />
          </Stack>
          <TextField
            label="Stream key"
            type="password"
            autoComplete="off"
            value={form.streamKey}
            onChange={(event) => setForm({ ...form, streamKey: event.target.value })}
            required={!editingId}
            helperText={editingId ? 'Leave empty to keep the existing key' : PLATFORM_META[form.platform].keyHelpText}
          />
          <Box>
            <TextField
              label="Ingest URL (advanced)"
              value={form.streamUrl}
              onChange={(event) => setForm({ ...form, streamUrl: event.target.value })}
              placeholder={PLATFORM_META[form.platform].defaultIngestUrl}
              fullWidth
              helperText={
                <Link href={PLATFORM_META[form.platform].keyHelpUrl} target="_blank" rel="noreferrer">
                  Where do I find my stream key?
                </Link>
              }
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFormOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!form.name.trim() || (!editingId && !form.streamKey.trim()) || save.isPending}
            onClick={() => save.mutate({ ...form, id: editingId })}
          >
            {editingId ? 'Save changes' : 'Add destination'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(revealed)} onClose={() => setRevealed(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Stream key — {revealed?.destination.name}</DialogTitle>
        <DialogContent>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body1" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {revealed?.key}
            </Typography>
            <IconButton
              aria-label="Copy stream key"
              onClick={async () => {
                if (revealed) {
                  await navigator.clipboard.writeText(revealed.key);
                  notify('info', 'Stream key copied to clipboard');
                }
              }}
            >
              <ContentCopy fontSize="small" />
            </IconButton>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRevealed(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete destination?"
        message={`"${deleteTarget?.name ?? ''}" will be removed. Past streams in History keep their records.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
      />
    </Stack>
  );
}
