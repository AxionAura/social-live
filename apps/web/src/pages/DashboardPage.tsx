import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  Stack,
  Typography,
} from '@mui/material';
import CheckCircle from '@mui/icons-material/CheckCircle';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import Podcasts from '@mui/icons-material/Podcasts';
import Stop from '@mui/icons-material/Stop';
import VideoLibrary from '@mui/icons-material/VideoLibrary';
import { useMutation } from '@tanstack/react-query';
import type { Stream } from '@social-live/shared';
import { api } from '../api/client.js';
import { useDashboard, useInvalidate } from '../api/hooks.js';
import { Elapsed, PlatformIcon, PulseDot, StatCard } from '../components/ui.js';

export default function DashboardPage() {
  const { data, isLoading } = useDashboard();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const stopMutation = useMutation({
    mutationFn: (streamId: string) => api.post<Stream>(`/api/streams/${streamId}/stop`),
    onSuccess: () => invalidate('dashboard', 'streams'),
  });

  const stats = data?.stats;

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
        <Box>
          <Typography variant="h5">Dashboard</Typography>
          <Typography variant="body2" color="text.secondary">
            Overview of your streaming setup
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Podcasts />} onClick={() => navigate('/streams/new')}>
          New Stream
        </Button>
      </Stack>

      <Grid container spacing={2} columns={{ xs: 4, sm: 8, md: 12 }}>
        <Grid size={{ xs: 4, sm: 4, md: 3 }}>
          <StatCard label="Active Streams" value={stats?.activeStreams ?? (isLoading ? '…' : 0)} icon={<PulseDot />} />
        </Grid>
        <Grid size={{ xs: 4, sm: 4, md: 3 }}>
          <StatCard label="Connected Platforms" value={stats?.connectedPlatforms ?? (isLoading ? '…' : 0)} icon={<CheckCircle />} />
        </Grid>
        <Grid size={{ xs: 4, sm: 4, md: 3 }}>
          <StatCard label="Videos" value={stats?.videos ?? (isLoading ? '…' : 0)} icon={<VideoLibrary />} />
        </Grid>
        <Grid size={{ xs: 4, sm: 4, md: 3 }}>
          <StatCard label="Completed Streams" value={stats?.completedStreams ?? (isLoading ? '…' : 0)} icon={<CheckCircleOutline />} />
        </Grid>
      </Grid>

      <Card>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Active Streams
          </Typography>
          <Divider sx={{ mb: 2 }} />
          {!data || data.activeStreams.length === 0 ? (
            <Stack alignItems="center" spacing={1.5} sx={{ py: 5, textAlign: 'center' }}>
              <Podcasts sx={{ fontSize: 44, color: 'text.disabled' }} />
              <Typography variant="body1" color="text.secondary">
                Nothing is live right now.
              </Typography>
              <Button variant="outlined" onClick={() => navigate('/streams/new')}>
                Start a stream
              </Button>
            </Stack>
          ) : (
            <Stack spacing={2}>
              {data.activeStreams.map((stream) => (
                <Card key={stream.id} variant="outlined">
                  <CardContent sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, alignItems: { md: 'center' } }}>
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 220 }}>
                      <Chip
                        color="error"
                        size="small"
                        icon={<PulseDot />}
                        label="LIVE"
                        sx={stream.status !== 'RUNNING' ? { opacity: 0.75 } : undefined}
                      />
                      <Stack>
                        <Typography variant="subtitle1" fontWeight={600}>
                          {stream.title}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {stream.videoName ?? 'video'} · started <Elapsed startedAt={stream.startedAt} /> ago
                        </Typography>
                      </Stack>
                    </Stack>
                    <Box sx={{ flexGrow: 1 }} />
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {stream.destinations.map((destination) => (
                        <Chip
                          key={destination.id}
                          icon={<PlatformIcon platform={destination.platform} size={16} />}
                          label={destination.status.toLowerCase()}
                          size="small"
                          color={
                            destination.status === 'RUNNING'
                              ? 'success'
                              : destination.status === 'FAILED'
                                ? 'error'
                                : destination.status === 'RECONNECTING'
                                  ? 'warning'
                                  : 'default'
                          }
                          variant="outlined"
                        />
                      ))}
                    </Stack>
                    <Stack direction="row" spacing={1}>
                      <Button size="small" variant="outlined" onClick={() => navigate(`/streams/${stream.id}`)}>
                        Manage
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        color="error"
                        startIcon={<Stop />}
                        onClick={() => stopMutation.mutate(stream.id)}
                        disabled={stopMutation.isPending}
                      >
                        Stop
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
