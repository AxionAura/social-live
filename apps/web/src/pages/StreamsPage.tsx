import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Card, CardContent, Chip, MenuItem, Pagination, Stack, TextField, Typography } from '@mui/material';
import Add from '@mui/icons-material/Add';
import Podcasts from '@mui/icons-material/Podcasts';
import type { Stream, StreamStatus } from '@social-live/shared';
import { STREAM_STATUS_META } from '@social-live/shared';
import { useStreams } from '../api/hooks.js';
import { SearchField } from '../components/Layout.js';
import { EmptyState, PlatformIcon, StatusChip } from '../components/ui.js';
import { formatDateTime } from '../lib/format.js';

const STATUS_OPTIONS: (StreamStatus | 'ALL')[] = [
  'ALL',
  'CREATED',
  'QUEUED',
  'STARTING',
  'RUNNING',
  'STOPPING',
  'STOPPED',
  'COMPLETED',
  'FAILED',
];

export default function StreamsPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading } = useStreams({ status, search: search || undefined, page, pageSize: 20 });
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
        <Box>
          <Typography variant="h5">Streams</Typography>
          <Typography variant="body2" color="text.secondary">
            Create and monitor live streams
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          <SearchField value={searchInput} onChange={setSearchInput} placeholder="Search streams…" />
          <TextField
            size="small"
            select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            sx={{ width: 160 }}
          >
            {STATUS_OPTIONS.map((option) => (
              <MenuItem key={option} value={option}>
                {option === 'ALL' ? 'All statuses' : STREAM_STATUS_META[option].label}
              </MenuItem>
            ))}
          </TextField>
          <Button variant="contained" startIcon={<Add />} onClick={() => navigate('/streams/new')}>
            New Stream
          </Button>
        </Stack>
      </Stack>

      {isLoading ? null : !data || data.items.length === 0 ? (
        <EmptyState
          icon={<Podcasts />}
          title="No streams found"
          message="Create a stream to send a recorded video to YouTube, Facebook or both at once."
          action={
            <Button variant="contained" startIcon={<Add />} onClick={() => navigate('/streams/new')}>
              New Stream
            </Button>
          }
        />
      ) : (
        <>
          <Stack spacing={1.5}>
            {data.items.map((stream: Stream) => (
              <Card
                key={stream.id}
                variant="outlined"
                sx={{ cursor: 'pointer', '&:hover': { borderColor: 'primary.main' } }}
                onClick={() => navigate(`/streams/${stream.id}`)}
              >
                <CardContent sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center', py: 2 }}>
                  <StatusChip status={stream.status} />
                  <Box sx={{ minWidth: 200, flexGrow: 1 }}>
                    <Typography variant="subtitle1" fontWeight={600}>
                      {stream.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {stream.videoName ?? 'video'} · created {formatDateTime(stream.createdAt)}
                      {stream.scheduledAt ? ` · scheduled ${formatDateTime(stream.scheduledAt)}` : ''}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={0.75}>
                    {stream.destinations.map((destination) => (
                      <Chip
                        key={destination.id}
                        size="small"
                        variant="outlined"
                        icon={<PlatformIcon platform={destination.platform} size={14} />}
                        label={destination.status.toLowerCase()}
                      />
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
          {totalPages > 1 ? (
            <Stack alignItems="center">
              <Pagination count={totalPages} page={page} onChange={(_event, value) => setPage(value)} />
            </Stack>
          ) : null}
        </>
      )}
    </Stack>
  );
}
