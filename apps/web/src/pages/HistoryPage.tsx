import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  MenuItem,
  Pagination,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import { PLATFORMS, type Platform } from '@social-live/shared';
import { useStreams } from '../api/hooks.js';
import { SearchField } from '../components/Layout.js';
import { EmptyState, PlatformIcon, StatusChip } from '../components/ui.js';
import { formatDate, formatDateTime } from '../lib/format.js';

const STATUS_OPTIONS = ['ALL', 'COMPLETED', 'FAILED', 'STOPPED'];

function durationBetween(startedAt: string | null, endedAt: string | null): string {
  if (!startedAt || !endedAt) return '—';
  const seconds = Math.max(0, (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState<string>('ALL');
  const [status, setStatus] = useState<string>('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading } = useStreams({
    status,
    platform: platform === 'ALL' ? undefined : platform,
    from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
    to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
    search: search || undefined,
    page,
    pageSize: 20,
  });
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5">History</Typography>
        <Typography variant="body2" color="text.secondary">
          Past streams with duration and outcome
        </Typography>
      </Box>

      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
        <SearchField value={searchInput} onChange={setSearchInput} placeholder="Search title or video…" />
        <TextField
          size="small"
          select
          label="Platform"
          value={platform}
          onChange={(event) => {
            setPlatform(event.target.value);
            setPage(1);
          }}
          sx={{ width: 150 }}
        >
          <MenuItem value="ALL">All platforms</MenuItem>
          {PLATFORMS.map((value: Platform) => (
            <MenuItem key={value} value={value}>
              <Stack direction="row" spacing={1} alignItems="center">
                <PlatformIcon platform={value} size={16} />
                <span style={{ textTransform: 'capitalize' }}>{value}</span>
              </Stack>
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          select
          label="Status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          sx={{ width: 150 }}
        >
          {STATUS_OPTIONS.map((value) => (
            <MenuItem key={value} value={value}>
              {value === 'ALL' ? 'All statuses' : value.toLowerCase()}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          type="date"
          label="From"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ width: 160 }}
        />
        <TextField
          size="small"
          type="date"
          label="To"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ width: 160 }}
        />
      </Stack>

      {isLoading ? null : !data || data.items.length === 0 ? (
        <EmptyState
          icon={<HistoryIcon />}
          title="No history yet"
          message="Finished streams will appear here with their duration and outcome."
        />
      ) : (
        <>
          <Card variant="outlined">
            <CardContent sx={{ p: 0 }}>
              <Stack sx={{ display: { xs: 'none', md: 'flex' }, px: 3, py: 1.5 }} direction="row" spacing={2}>
                <Typography variant="overline" sx={{ width: 110 }}>Date</Typography>
                <Typography variant="overline" sx={{ width: 200 }}>Video</Typography>
                <Typography variant="overline" sx={{ width: 200 }}>Destination</Typography>
                <Typography variant="overline" sx={{ width: 90 }}>Duration</Typography>
                <Typography variant="overline">Status</Typography>
              </Stack>
              {data.items.map((stream) =>
                stream.destinations.length > 0 ? (
                  stream.destinations.map((destination, index) => (
                    <Stack
                      key={destination.id}
                      component={index === 0 ? 'div' : 'div'}
                      direction={{ xs: 'column', md: 'row' }}
                      spacing={{ xs: 0.5, md: 2 }}
                      sx={{
                        px: 3,
                        py: 1.5,
                        borderTop: '1px solid',
                        borderColor: 'divider',
                        cursor: 'pointer',
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                      onClick={() => navigate(`/streams/${stream.id}`)}
                    >
                      <Typography variant="body2" sx={{ width: { md: 110 } }} color="text.secondary">
                        {formatDate(stream.createdAt)}
                      </Typography>
                      <Typography variant="body2" sx={{ width: { md: 200 } }} noWrap title={stream.videoName ?? ''}>
                        {index === 0 ? stream.videoName ?? '—' : ''}
                      </Typography>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ width: { md: 200 } }}>
                        <PlatformIcon platform={destination.platform} size={16} />
                        <Typography variant="body2" noWrap>
                          {destination.destinationName}
                        </Typography>
                      </Stack>
                      <Typography variant="body2" sx={{ width: { md: 90 } }}>
                        {durationBetween(destination.startedAt ?? stream.startedAt, destination.endedAt ?? stream.endedAt)}
                      </Typography>
                      {index === 0 ? (
                        <StatusChip status={stream.status} />
                      ) : (
                        <Chip size="small" label={destination.status.toLowerCase()} />
                      )}
                    </Stack>
                  ))
                ) : (
                  <Stack
                    key={stream.id}
                    direction={{ xs: 'column', md: 'row' }}
                    spacing={{ xs: 0.5, md: 2 }}
                    sx={{ px: 3, py: 1.5, borderTop: '1px solid', borderColor: 'divider', cursor: 'pointer' }}
                    onClick={() => navigate(`/streams/${stream.id}`)}
                  >
                    <Typography variant="body2" sx={{ width: { md: 110 } }} color="text.secondary">
                      {formatDate(stream.createdAt)}
                    </Typography>
                    <Typography variant="body2" sx={{ width: { md: 200 } }}>
                      {stream.videoName ?? '—'}
                    </Typography>
                    <Typography variant="body2" sx={{ width: { md: 200 } }}>—</Typography>
                    <Typography variant="body2" sx={{ width: { md: 90 } }}>—</Typography>
                    <StatusChip status={stream.status} />
                  </Stack>
                ),
              )}
            </CardContent>
          </Card>
          {totalPages > 1 ? (
            <Stack alignItems="center">
              <Pagination count={totalPages} page={page} onChange={(_event, value) => setPage(value)} />
            </Stack>
          ) : null}
          <Typography variant="caption" color="text.secondary">
            Times are shown in your browser timezone ({formatDateTime(new Date().toISOString())} now)
          </Typography>
        </>
      )}
    </Stack>
  );
}
