import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import ArrowBack from '@mui/icons-material/ArrowBack';
import Delete from '@mui/icons-material/Delete';
import PlayArrow from '@mui/icons-material/PlayArrow';
import Stop from '@mui/icons-material/Stop';
import { ACTIVE_STREAM_STATUSES, TERMINAL_STREAM_STATUSES, type Stream } from '@social-live/shared';
import { api } from '../api/client.js';
import { useInvalidate, useStream, useStreamLogs } from '../api/hooks.js';
import { ConfirmDialog, DestinationStatusChip, Elapsed, PlatformIcon, PulseDot, StatusChip } from '../components/ui.js';
import { formatDateTime } from '../lib/format.js';

export default function StreamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const { data: stream, isLoading } = useStream(id);
  const isActive = stream ? ACTIVE_STREAM_STATUSES.includes(stream.status) : false;
  const { data: logs } = useStreamLogs(id, isActive);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const startMutation = useMutation({
    mutationFn: (streamId: string) => api.post<Stream>(`/api/streams/${streamId}/start`),
    onSuccess: () => invalidate('streams', 'dashboard'),
  });
  const stopMutation = useMutation({
    mutationFn: (streamId: string) => api.post<Stream>(`/api/streams/${streamId}/stop`),
    onSuccess: () => invalidate('streams', 'dashboard'),
  });
  const deleteMutation = useMutation({
    mutationFn: (streamId: string) => api.delete(`/api/streams/${streamId}`),
    onSuccess: () => {
      invalidate('streams', 'dashboard');
      navigate('/streams');
    },
  });

  const destinationByName = useMemo(() => {
    const map = new Map<string, string>();
    stream?.destinations.forEach((destination) => map.set(destination.id, destination.destinationName));
    return map;
  }, [stream]);

  if (isLoading || !stream) {
    return (
      <Stack spacing={2}>
        <Button startIcon={<ArrowBack />} onClick={() => navigate('/streams')} sx={{ alignSelf: 'flex-start' }}>
          Back to streams
        </Button>
        <Typography color="text.secondary">Loading stream…</Typography>
      </Stack>
    );
  }

  const canStart = stream.status === 'CREATED' || stream.status === 'QUEUED';
  const canStop = isActive;
  const canDelete = TERMINAL_STREAM_STATUSES.includes(stream.status);

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Button startIcon={<ArrowBack />} onClick={() => navigate('/streams')}>
          Streams
        </Button>
        <Box sx={{ flexGrow: 1 }} />
        {canStart ? (
          <Button
            variant="contained"
            color="success"
            startIcon={<PlayArrow />}
            onClick={() => id && startMutation.mutate(id)}
            disabled={startMutation.isPending}
          >
            Start now
          </Button>
        ) : null}
        {canStop ? (
          <Button
            variant="contained"
            color="error"
            startIcon={<Stop />}
            onClick={() => id && stopMutation.mutate(id)}
            disabled={stopMutation.isPending}
          >
            Stop
          </Button>
        ) : null}
        {canDelete ? (
          <Button color="error" startIcon={<Delete />} onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        ) : null}
      </Stack>

      {startMutation.isError ? (
        <Alert severity="error">{(startMutation.error as Error).message}</Alert>
      ) : null}
      {stopMutation.isError ? <Alert severity="error">{(stopMutation.error as Error).message}</Alert> : null}

      <Card>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" useFlexGap>
            {stream.status === 'RUNNING' ? <Chip color="error" icon={<PulseDot />} label="LIVE" /> : null}
            <StatusChip status={stream.status} size="medium" />
            <Typography variant="h5" sx={{ flexGrow: 1 }}>
              {stream.title}
            </Typography>
          </Stack>
          {stream.description ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {stream.description}
            </Typography>
          ) : null}

          <Grid container spacing={2} sx={{ mt: 1.5 }} columns={{ xs: 4, md: 12 }}>
            <Grid size={{ xs: 4, md: 3 }}>
              <Typography variant="overline" display="block" color="text.secondary">Video</Typography>
              <Typography variant="body2">{stream.videoName ?? '—'}</Typography>
            </Grid>
            <Grid size={{ xs: 4, md: 3 }}>
              <Typography variant="overline" display="block" color="text.secondary">Elapsed</Typography>
              <Typography variant="body2">{isActive ? <Elapsed startedAt={stream.startedAt} /> : formatDateTime(stream.endedAt)}</Typography>
            </Grid>
            <Grid size={{ xs: 4, md: 3 }}>
              <Typography variant="overline" display="block" color="text.secondary">Privacy</Typography>
              <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>{stream.privacy}</Typography>
            </Grid>
            <Grid size={{ xs: 4, md: 3 }}>
              <Typography variant="overline" display="block" color="text.secondary">Loop</Typography>
              <Typography variant="body2">
                {stream.loopMode === 'none' ? 'No loop' : stream.loopMode === 'infinite' ? 'Infinite' : `${stream.loopCount}×`}
              </Typography>
            </Grid>
            <Grid size={{ xs: 4, md: 3 }}>
              <Typography variant="overline" display="block" color="text.secondary">Created</Typography>
              <Typography variant="body2">{formatDateTime(stream.createdAt)}</Typography>
            </Grid>
            {stream.scheduledAt ? (
              <Grid size={{ xs: 4, md: 3 }}>
                <Typography variant="overline" display="block" color="text.secondary">Scheduled</Typography>
                <Typography variant="body2">{formatDateTime(stream.scheduledAt)}</Typography>
              </Grid>
            ) : null}
          </Grid>

          {stream.errorMessage ? (
            <Alert severity="error" sx={{ mt: 2 }}>
              {stream.errorMessage}
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Destinations
          </Typography>
          <Grid container spacing={2} columns={{ xs: 4, md: 12 }}>
            {stream.destinations.map((destination) => (
              <Grid key={destination.id} size={{ xs: 4, md: 6 }}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Stack direction="row" alignItems="center" spacing={1.5}>
                    <PlatformIcon platform={destination.platform} size={22} />
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Typography variant="subtitle2" noWrap>
                        {destination.destinationName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
                        {destination.platform}
                      </Typography>
                    </Box>
                    <DestinationStatusChip status={destination.status} />
                  </Stack>
                  <Divider sx={{ my: 1.5 }} />
                  <Grid container spacing={1} columns={12}>
                    <Grid size={6}>
                      <Typography variant="caption" color="text.secondary" display="block">Bitrate</Typography>
                      <Typography variant="body2">
                        {destination.lastMetrics?.bitrateKbps != null ? `${Math.round(destination.lastMetrics.bitrateKbps)} kbps` : '—'}
                      </Typography>
                    </Grid>
                    <Grid size={6}>
                      <Typography variant="caption" color="text.secondary" display="block">FPS</Typography>
                      <Typography variant="body2">{destination.lastMetrics?.fps ?? '—'}</Typography>
                    </Grid>
                    <Grid size={6}>
                      <Typography variant="caption" color="text.secondary" display="block">Streamed</Typography>
                      <Typography variant="body2">
                        {destination.lastMetrics?.streamedSeconds != null
                          ? `${Math.floor(destination.lastMetrics.streamedSeconds / 60)} min`
                          : '—'}
                      </Typography>
                    </Grid>
                    <Grid size={6}>
                      <Typography variant="caption" color="text.secondary" display="block">Reconnects</Typography>
                      <Typography variant="body2">{destination.reconnectCount}</Typography>
                    </Grid>
                  </Grid>
                  {destination.errorMessage ? (
                    <Alert severity="error" sx={{ mt: 1.5, py: 0.5 }}>
                      {destination.errorMessage}
                    </Alert>
                  ) : null}
                </Paper>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      <Card>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Stream Logs
          </Typography>
          <Paper
            variant="outlined"
            sx={{
              maxHeight: 380,
              overflow: 'auto',
              p: 1.5,
              bgcolor: 'background.default',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 12.5,
              lineHeight: 1.7,
            }}
          >
            {!logs || logs.items.length === 0 ? (
              <Typography color="text.secondary" sx={{ p: 1 }}>
                No log entries yet.
              </Typography>
            ) : (
              logs.items.map((entry) => (
                <Box key={entry.id} sx={{ display: 'flex', gap: 1 }}>
                  <Typography component="span" sx={{ color: 'text.disabled', flexShrink: 0 }}>
                    {new Date(entry.createdAt).toLocaleTimeString()}
                  </Typography>
                  {entry.streamDestinationId && destinationByName.get(entry.streamDestinationId) ? (
                    <Typography component="span" sx={{ color: 'secondary.main', flexShrink: 0 }}>
                      [{destinationByName.get(entry.streamDestinationId)}]
                    </Typography>
                  ) : null}
                  <Typography
                    component="span"
                    sx={{
                      color:
                        entry.level === 'error'
                          ? 'error.main'
                          : entry.level === 'warn'
                            ? 'warning.main'
                            : 'text.primary',
                      wordBreak: 'break-word',
                    }}
                  >
                    {entry.message}
                  </Typography>
                </Box>
              ))
            )}
          </Paper>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete stream record?"
        message="The stream and its logs will be permanently removed from the history."
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => id && deleteMutation.mutate(id)}
      />
    </Stack>
  );
}
