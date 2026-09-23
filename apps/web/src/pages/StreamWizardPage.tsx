import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardMedia,
  Checkbox,
  Chip,
  FormControlLabel,
  Grid,
  MenuItem,
  Paper,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material';
import AddLink from '@mui/icons-material/AddLink';
import PlayArrow from '@mui/icons-material/PlayArrow';
import Schedule from '@mui/icons-material/Schedule';
import VideoLibrary from '@mui/icons-material/VideoLibrary';
import type { Destination, Privacy, StartMode, LoopMode, Stream, Video } from '@social-live/shared';
import { api, ApiError } from '../api/client.js';
import { useAllVideos, useDestinations } from '../api/hooks.js';
import { PlatformIcon } from '../components/ui.js';
import { formatBytes, formatDuration } from '../lib/format.js';

const STEPS = ['Select video', 'Destinations', 'Configure', 'Review', 'Start'];

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function StreamWizardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const videosQuery = useAllVideos();
  const destinationsQuery = useDestinations();

  const [step, setStep] = useState(0);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [destinationIds, setDestinationIds] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState<Privacy>('unlisted');
  const [startMode, setStartMode] = useState<StartMode>('now');
  const [scheduledLocal, setScheduledLocal] = useState(() => toLocalInputValue(new Date(Date.now() + 3600_000)));
  const [loopMode, setLoopMode] = useState<LoopMode>('none');
  const [loopCount, setLoopCount] = useState(2);
  const [error, setError] = useState<string | null>(null);

  const videos = videosQuery.data?.items ?? [];
  const destinations = destinationsQuery.data?.items ?? [];
  const selectedVideo: Video | undefined = videos.find((video) => video.id === videoId);
  const selectedDestinations: Destination[] = destinations.filter((destination) =>
    destinationIds.includes(destination.id),
  );

  const createMutation = useMutation({
    mutationFn: async (start: boolean) => {
      const payload = {
        videoId: videoId!,
        destinationIds,
        title: title.trim(),
        description: description.trim(),
        privacy,
        startMode,
        scheduledAt:
          startMode === 'schedule'
            ? new Date(new Date(scheduledLocal).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString()
            : undefined,
        loopMode,
        loopCount: loopMode === 'times' ? loopCount : undefined,
      };
      const stream = await api.post<Stream>('/api/streams', payload);
      if (start && startMode === 'now') {
        return api.post<Stream>(`/api/streams/${stream.id}/start`);
      }
      return stream;
    },
    onSuccess: (stream) => {
      void queryClient.invalidateQueries();
      navigate(`/streams/${stream.id}`);
    },
    onError: (mutationError) =>
      setError(mutationError instanceof ApiError ? mutationError.message : 'Could not create the stream'),
  });

  const canNext = useMemo(() => {
    switch (step) {
      case 0:
        return Boolean(videoId);
      case 1:
        return destinationIds.length > 0;
      case 2:
        return title.trim().length > 0 && (startMode !== 'schedule' || Boolean(scheduledLocal));
      default:
        return true;
    }
  }, [step, videoId, destinationIds, title, scheduledLocal, startMode]);

  function toggleDestination(id: string) {
    setDestinationIds((previous) =>
      previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id],
    );
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 960, mx: 'auto' }}>
      <Box>
        <Typography variant="h5">New Stream</Typography>
        <Typography variant="body2" color="text.secondary">
          Broadcast a recorded video to one or more destinations
        </Typography>
      </Box>

      <Stepper activeStep={step} alternativeLabel>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {error ? <Alert severity="error">{error}</Alert> : null}
      {destinations.length === 0 && step === 1 ? (
        <Alert severity="info">
          No destinations configured yet — add YouTube or Facebook first on the Destinations page.
        </Alert>
      ) : null}

      <Card>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          {step === 0 ? (
            <Stack spacing={2}>
              <Typography variant="h6">Select video</Typography>
              {videos.length === 0 ? (
                <Alert severity="info">
                  Upload a video first on the Videos page — then come back here.
                </Alert>
              ) : (
                <Box
                  sx={{
                    display: 'grid',
                    gap: 2,
                    gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
                  }}
                >
                  {videos.map((video) => (
                    <Paper
                      key={video.id}
                      onClick={() => setVideoId(video.id)}
                      variant="outlined"
                      sx={(theme) => ({
                        cursor: 'pointer',
                        overflow: 'hidden',
                        borderColor: videoId === video.id ? 'primary.main' : theme.palette.divider,
                        borderWidth: videoId === video.id ? 2 : 1,
                      })}
                    >
                      <Box sx={{ position: 'relative', pt: '56.25%', bgcolor: 'action.hover' }}>
                        {video.hasThumbnail ? (
                          <CardMedia
                            component="img"
                            image={`/api/videos/${video.id}/thumbnail`}
                            alt={video.name}
                            sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'text.disabled' }}>
                            <VideoLibrary />
                          </Box>
                        )}
                        <Chip
                          size="small"
                          label={formatDuration(video.duration)}
                          sx={{ position: 'absolute', bottom: 6, right: 6, bgcolor: 'rgba(0,0,0,0.65)', color: '#fff' }}
                        />
                      </Box>
                      <Box sx={{ p: 1.25 }}>
                        <Typography variant="subtitle2" noWrap>
                          {video.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {video.resolution ?? '—'} · {formatBytes(video.fileSize)}
                        </Typography>
                      </Box>
                    </Paper>
                  ))}
                </Box>
              )}
            </Stack>
          ) : null}

          {step === 1 ? (
            <Stack spacing={2}>
              <Typography variant="h6">Select destinations</Typography>
              <Typography variant="body2" color="text.secondary">
                Each destination runs as an independent FFmpeg process — one can fail without affecting the other.
              </Typography>
              <Stack spacing={1}>
                {destinations.map((destination) => (
                  <Paper
                    key={destination.id}
                    variant="outlined"
                    sx={{ px: 2, py: 1.25, display: 'flex', alignItems: 'center', gap: 1.5 }}
                  >
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={destinationIds.includes(destination.id)}
                          onChange={() => toggleDestination(destination.id)}
                        />
                      }
                      label={
                        <Stack direction="row" spacing={1} alignItems="center">
                          <PlatformIcon platform={destination.platform} />
                          <Box>
                            <Typography variant="body2" fontWeight={600}>
                              {destination.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
                              {destination.platform}
                            </Typography>
                          </Box>
                        </Stack>
                      }
                    />
                  </Paper>
                ))}
              </Stack>
            </Stack>
          ) : null}

          {step === 2 ? (
            <Stack spacing={2.5}>
              <Typography variant="h6">Configure stream</Typography>
              <TextField
                label="Title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                inputProps={{ maxLength: 200 }}
                required
                fullWidth
              />
              <TextField
                label="Description (optional)"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                multiline
                minRows={3}
                inputProps={{ maxLength: 5000 }}
                fullWidth
              />
              <Grid container spacing={2} columns={{ xs: 4, sm: 8 }}>
                <Grid size={{ xs: 4, sm: 4 }}>
                  <TextField
                    select
                    label="Privacy"
                    value={privacy}
                    onChange={(event) => setPrivacy(event.target.value as Privacy)}
                    fullWidth
                    helperText="Metadata privacy is controlled on the platform for manual-key streams"
                  >
                    <MenuItem value="public">Public</MenuItem>
                    <MenuItem value="unlisted">Unlisted</MenuItem>
                    <MenuItem value="private">Private</MenuItem>
                  </TextField>
                </Grid>
                <Grid size={{ xs: 4, sm: 4 }}>
                  <TextField
                    select
                    label="Loop"
                    value={loopMode}
                    onChange={(event) => setLoopMode(event.target.value as LoopMode)}
                    fullWidth
                  >
                    <MenuItem value="none">No loop</MenuItem>
                    <MenuItem value="times">Repeat N times</MenuItem>
                    <MenuItem value="infinite">Infinite</MenuItem>
                  </TextField>
                </Grid>
                {loopMode === 'times' ? (
                  <Grid size={{ xs: 4, sm: 4 }}>
                    <TextField
                      label="Repeat count"
                      type="number"
                      value={loopCount}
                      onChange={(event) => setLoopCount(Math.max(2, Math.min(1000, Number(event.target.value) || 2)))}
                      inputProps={{ min: 2, max: 1000 }}
                      fullWidth
                    />
                  </Grid>
                ) : null}
                <Grid size={{ xs: 4, sm: 4 }}>
                  <TextField
                    select
                    label="Start mode"
                    value={startMode}
                    onChange={(event) => setStartMode(event.target.value as StartMode)}
                    fullWidth
                  >
                    <MenuItem value="now">
                      <Stack direction="row" spacing={1} alignItems="center">
                        <PlayArrow fontSize="small" /> Start now
                      </Stack>
                    </MenuItem>
                    <MenuItem value="schedule">
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Schedule fontSize="small" /> Schedule
                      </Stack>
                    </MenuItem>
                  </TextField>
                </Grid>
                {startMode === 'schedule' ? (
                  <Grid size={{ xs: 4, sm: 4 }}>
                    <TextField
                      label="Start at"
                      type="datetime-local"
                      value={scheduledLocal}
                      onChange={(event) => setScheduledLocal(event.target.value)}
                      slotProps={{ inputLabel: { shrink: true } }}
                      fullWidth
                    />
                  </Grid>
                ) : null}
              </Grid>
            </Stack>
          ) : null}

          {step === 3 ? (
            <Stack spacing={2}>
              <Typography variant="h6">Review</Typography>
              <Paper variant="outlined" sx={{ p: 2, display: 'grid', gap: 1 }}>
                {[
                  ['Video', selectedVideo?.name ?? '—'],
                  ['Destinations', selectedDestinations.map((destination) => destination.name).join(', ') || '—'],
                  ['Title', title || '—'],
                  ['Privacy', privacy],
                  ['Loop', loopMode === 'none' ? 'No loop' : loopMode === 'infinite' ? 'Infinite' : `${loopCount}×`],
                  [
                    'Start',
                    startMode === 'now'
                      ? 'Immediately after creation'
                      : new Date(scheduledLocal).toLocaleString(),
                  ],
                ].map(([label, value]) => (
                  <Stack key={label} direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0.25, sm: 2 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ width: 130 }}>
                      {label}
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {value}
                    </Typography>
                  </Stack>
                ))}
              </Paper>
              {selectedDestinations.length > 1 ? (
                <Alert severity="info">
                  Multi-destination streaming: the same video will be published to {selectedDestinations.length} platforms simultaneously.
                </Alert>
              ) : null}
            </Stack>
          ) : null}

          {step === 4 ? (
            <Stack spacing={2} alignItems="center" sx={{ py: 4, textAlign: 'center' }}>
              <Typography variant="h6">Ready to go live</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 460 }}>
                {startMode === 'schedule'
                  ? 'The stream is queued — the background scheduler will start it at the scheduled time, even if this browser is closed.'
                  : 'Streaming runs in the server process — you can close this browser tab safely once it starts.'}
              </Typography>
            </Stack>
          ) : null}
        </CardContent>
      </Card>

      <Stack direction="row" spacing={1} justifyContent="space-between">
        <Button
          disabled={step === 0 || createMutation.isPending}
          onClick={() => {
            setError(null);
            setStep((previous) => previous - 1);
          }}
        >
          Back
        </Button>
        {step < 4 ? (
          <Button
            variant="contained"
            disabled={!canNext}
            onClick={() => {
              setError(null);
              setStep((previous) => previous + 1);
            }}
          >
            Next
          </Button>
        ) : (
          <Button
            variant="contained"
            color="success"
            size="large"
            startIcon={<PlayArrow />}
            disabled={createMutation.isPending}
            onClick={() => createMutation.mutate(true)}
          >
            {createMutation.isPending
              ? 'Starting…'
              : startMode === 'schedule'
                ? 'Schedule stream'
                : 'Start streaming'}
          </Button>
        )}
      </Stack>

      {destinations.length === 0 ? (
        <Button startIcon={<AddLink />} onClick={() => navigate('/destinations')}>
          Add a destination first
        </Button>
      ) : null}
    </Stack>
  );
}
