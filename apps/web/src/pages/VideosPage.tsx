import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardMedia,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  MenuItem,
  Menu,
  Pagination,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import Delete from '@mui/icons-material/Delete';
import Edit from '@mui/icons-material/Edit';
import Info from '@mui/icons-material/Info';
import MoreVert from '@mui/icons-material/MoreVert';
import UploadFile from '@mui/icons-material/UploadFile';
import VideocamOff from '@mui/icons-material/VideocamOff';
import type { Video } from '@social-live/shared';
import { api, ApiError } from '../api/client.js';
import { useVideos } from '../api/hooks.js';
import { SearchField } from '../components/Layout.js';
import { ConfirmDialog, EmptyState } from '../components/ui.js';
import { formatBytes, formatDate, formatDuration } from '../lib/format.js';

const SORT_OPTIONS = [
  { value: 'created_at:DESC', label: 'Newest first' },
  { value: 'created_at:ASC', label: 'Oldest first' },
  { value: 'name:ASC', label: 'Name (A–Z)' },
  { value: 'duration:DESC', label: 'Longest first' },
  { value: 'file_size:DESC', label: 'Largest first' },
];

export default function VideosPage() {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('created_at:DESC');
  const [page, setPage] = useState(1);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<Video | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [infoTarget, setInfoTarget] = useState<Video | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Video | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ video: Video; el: HTMLElement } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const [sortField, sortOrder] = sort.split(':');

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading } = useVideos({
    search: search || undefined,
    sort: sortField,
    order: sortOrder,
    page,
    pageSize: 24,
  });

  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.upload<Video>('/api/videos', form, (fraction) => setUploadProgress(fraction));
    },
    onSuccess: () => {
      setUploadProgress(null);
      void queryClient.invalidateQueries({ queryKey: ['videos'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: () => setUploadProgress(null),
  });

  const rename = useMutation({
    mutationFn: (input: { id: string; name: string }) => api.patch<Video>(`/api/videos/${input.id}`, { name: input.name }),
    onSuccess: () => {
      setRenameTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['videos'] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/videos/${id}`),
    onSuccess: () => {
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['videos'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploadError(null);
    upload.mutate(file, {
      onError: (error) => setUploadError(error instanceof ApiError ? error.message : 'Upload failed'),
    });
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    handleFiles(event.dataTransfer.files);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
        <Box>
          <Typography variant="h5">Videos</Typography>
          <Typography variant="body2" color="text.secondary">
            Recorded videos ready to go live (MP4 / MOV / MKV)
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          <SearchField
            value={searchInput}
            onChange={setSearchInput}
            placeholder="Search videos…"
          />
          <TextField
            size="small"
            select
            value={sort}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setSort(event.target.value)}
            sx={{ width: 180 }}
          >
            {SORT_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
          <Button variant="contained" startIcon={<UploadFile />} onClick={() => fileInputRef.current?.click()}>
            Upload
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp4,.mov,.mkv,video/mp4,video/quicktime,video/x-matroska"
            hidden
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              handleFiles(event.target.files);
              event.target.value = '';
            }}
          />
        </Stack>
      </Stack>

      <Paper
        onDragOver={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        sx={(theme) => ({
          p: 3,
          textAlign: 'center',
          cursor: 'pointer',
          border: '2px dashed',
          borderColor: dragOver ? 'primary.main' : theme.palette.divider,
          bgcolor: dragOver ? 'rgba(198,40,40,0.05)' : 'transparent',
          transition: 'border-color .15s, background-color .15s',
        })}
      >
        <Typography variant="body1" fontWeight={600}>
          Drag &amp; drop a video here, or click to browse
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Minimum supported format: MP4 (H.264 + AAC) · max {formatBytes(5 * 1024 * 1024 * 1024)}
        </Typography>
        {uploadProgress !== null ? (
          <Box sx={{ mt: 2 }}>
            <LinearProgress variant="determinate" value={Math.round(uploadProgress * 100)} />
            <Typography variant="caption" color="text.secondary">
              Uploading… {Math.round(uploadProgress * 100)}%
            </Typography>
          </Box>
        ) : null}
        {uploadError ? (
          <Alert severity="error" sx={{ mt: 2, textAlign: 'left' }}>
            {uploadError}
          </Alert>
        ) : null}
      </Paper>

      {isLoading ? (
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' },
          }}
        >
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} variant="rounded" height={220} />
          ))}
        </Box>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={<VideocamOff />}
          title="No videos yet"
          message="Upload a recorded video to get started. It stays on your server — nothing is sent to third parties until you stream."
        />
      ) : (
        <>
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' },
            }}
          >
            {data.items.map((video) => (
              <Card key={video.id} sx={{ display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ position: 'relative', pt: '56.25%', bgcolor: 'action.hover' }}>
                  {video.hasThumbnail ? (
                    <CardMedia
                      component="img"
                      image={`/api/videos/${video.id}/thumbnail`}
                      alt={video.name}
                      sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <Box
                      sx={{
                        position: 'absolute',
                        inset: 0,
                        display: 'grid',
                        placeItems: 'center',
                        color: 'text.disabled',
                      }}
                    >
                      <VideocamOff />
                    </Box>
                  )}
                  <Chip
                    size="small"
                    label={formatDuration(video.duration)}
                    sx={{ position: 'absolute', bottom: 8, right: 8, bgcolor: 'rgba(0,0,0,0.65)', color: '#fff' }}
                  />
                </Box>
                <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 0.5, pb: 1 }}>
                  <Typography variant="subtitle2" noWrap title={video.name}>
                    {video.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatBytes(video.fileSize)} · {video.resolution ?? '—'} · {formatDate(video.createdAt)}
                  </Typography>
                  {video.status !== 'READY' ? <Chip size="small" label={video.status} color="warning" /> : null}
                </CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 1 }}>
                  <IconButton
                    aria-label="Video actions"
                    onClick={(event) => setMenuAnchor({ video, el: event.currentTarget })}
                  >
                    <MoreVert />
                  </IconButton>
                </Box>
              </Card>
            ))}
          </Box>
          {totalPages > 1 ? (
            <Stack alignItems="center">
              <Pagination count={totalPages} page={page} onChange={(_e, value) => setPage(value)} />
            </Stack>
          ) : null}
        </>
      )}

      <Menu
        anchorEl={menuAnchor?.el ?? null}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <MenuItem
          onClick={() => {
            if (menuAnchor) {
              setRenameTarget(menuAnchor.video);
              setRenameValue(menuAnchor.video.name);
            }
            setMenuAnchor(null);
          }}
        >
          <Edit fontSize="small" />
          <Box sx={{ ml: 1 }}>Rename</Box>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setInfoTarget(menuAnchor?.video ?? null);
            setMenuAnchor(null);
          }}
        >
          <Info fontSize="small" />
          <Box sx={{ ml: 1 }}>Properties</Box>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setDeleteTarget(menuAnchor?.video ?? null);
            setMenuAnchor(null);
          }}
        >
          <Delete fontSize="small" />
          <Box sx={{ ml: 1 }}>Delete</Box>
        </MenuItem>
      </Menu>

      <Dialog open={Boolean(renameTarget)} onClose={() => setRenameTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Rename video</DialogTitle>
        <DialogContent sx={{ '&&': { pt: 2 } }}>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameTarget(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!renameValue.trim() || rename.isPending}
            onClick={() => renameTarget && rename.mutate({ id: renameTarget.id, name: renameValue.trim() })}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(infoTarget)} onClose={() => setInfoTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Video properties</DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ mt: 1 }}>
            {infoTarget
              ? [
                  ['Name', infoTarget.name],
                  ['Original filename', infoTarget.originalName],
                  ['Duration', formatDuration(infoTarget.duration)],
                  ['Size', formatBytes(infoTarget.fileSize)],
                  ['Resolution', infoTarget.resolution ?? '—'],
                  ['Codec', infoTarget.codec ?? '—'],
                  ['Uploaded', formatDate(infoTarget.createdAt)],
                  ['Status', infoTarget.status],
                ].map(([label, value]) => (
                  <Stack key={label} direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">
                      {label}
                    </Typography>
                    <Typography variant="body2">{value}</Typography>
                  </Stack>
                ))
              : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInfoTarget(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete video?"
        message={`"${deleteTarget?.name ?? ''}" will be permanently removed from your server. This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
      />
    </Stack>
  );
}
