import { useEffect, useState, type ReactNode } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  SvgIcon,
  type SvgIconProps,
  TextField,
  Typography,
} from '@mui/material';
import CheckCircle from '@mui/icons-material/CheckCircle';
import Facebook from '@mui/icons-material/Facebook';
import YouTube from '@mui/icons-material/YouTube';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import type { Platform, StreamDestinationStatus, StreamStatus } from '@social-live/shared';
import { STREAM_STATUS_META } from '@social-live/shared';

const DEST_STATUS_COLORS: Record<StreamDestinationStatus, 'error' | 'warning' | 'success' | 'default'> = {
  CREATED: 'default',
  STARTING: 'warning',
  RUNNING: 'success',
  RECONNECTING: 'warning',
  STOPPING: 'warning',
  STOPPED: 'default',
  COMPLETED: 'success',
  FAILED: 'error',
};

export function StatusChip({ status, size }: { status: StreamStatus; size?: 'small' | 'medium' }) {
  const meta = STREAM_STATUS_META[status];
  return (
    <Chip
      size={size ?? 'small'}
      color={meta.color as 'error' | 'warning' | 'success' | 'info' | 'default'}
      label={meta.label}
      icon={status === 'RUNNING' ? <PulseDot /> : undefined}
    />
  );
}

export function DestinationStatusChip({ status }: { status: StreamDestinationStatus }) {
  return <Chip size="small" color={DEST_STATUS_COLORS[status]} label={status.toLowerCase()} />;
}

export function PulseDot() {
  return (
    <Box
      component="span"
      sx={(theme) => ({
        width: 8,
        height: 8,
        borderRadius: '50%',
        display: 'inline-block',
        bgcolor: theme.palette.error.main,
        animation: 'sl-pulse 1.4s ease-in-out infinite',
        '@keyframes sl-pulse': {
          '0%, 100%': { opacity: 1, transform: 'scale(1)' },
          '50%': { opacity: 0.45, transform: 'scale(0.82)' },
        },
      })}
    />
  );
}

/** Brand glyphs not shipped by Material Icons (simple-icons paths). */
function TwitchIcon(props: SvgIconProps) {
  return (
    <SvgIcon viewBox="0 0 24 24" {...props}>
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0 1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
    </SvgIcon>
  );
}

function KickIcon(props: SvgIconProps) {
  return (
    <SvgIcon viewBox="0 0 24 24" {...props}>
      <path d="M1.5 0h21v7.5H15V15h7.5v7.5h-21V15H9V7.5H1.5z" />
    </SvgIcon>
  );
}

export function PlatformIcon({ platform, size = 20 }: { platform: Platform; size?: number }) {
  if (platform === 'youtube') {
    return <YouTube sx={{ fontSize: size, color: '#ff0000' }} />;
  }
  if (platform === 'twitch') {
    return <TwitchIcon sx={{ fontSize: size, color: '#9146ff' }} />;
  }
  if (platform === 'kick') {
    return <KickIcon sx={{ fontSize: size, color: '#53fc18' }} />;
  }
  return <Facebook sx={{ fontSize: size, color: '#1877f2' }} />;
}

export function StatCard({ label, value, icon }: { label: string; value: number | string; icon: ReactNode }) {
  return (
    <Paper sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2, height: '100%' }}>
      <Stack
        sx={{
          width: 46,
          height: 46,
          borderRadius: 3,
          display: 'grid',
          placeItems: 'center',
          bgcolor: 'rgba(198,40,40,0.10)',
          color: 'primary.main',
        }}
      >
        {icon}
      </Stack>
      <Stack>
        <Typography variant="h5" sx={{ lineHeight: 1.1 }}>
          {value}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      </Stack>
    </Paper>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button onClick={onConfirm} color={danger ? 'error' : 'primary'} variant="contained" autoFocus>
          {confirmLabel ?? 'Confirm'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: ReactNode;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <Stack alignItems="center" spacing={1.5} sx={{ py: 8, textAlign: 'center' }}>
      <Stack
        sx={{
          width: 64,
          height: 64,
          borderRadius: 4,
          display: 'grid',
          placeItems: 'center',
          bgcolor: 'action.hover',
          color: 'text.secondary',
        }}
      >
        {icon}
      </Stack>
      <Typography variant="h6">{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
        {message}
      </Typography>
      {action}
    </Stack>
  );
}

export function StreamKeyField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      label="Stream key"
      placeholder={placeholder ?? 'Paste the platform stream key'}
      type={visible ? 'text' : 'password'}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      autoComplete="off"
      required
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <IconButton
              aria-label={visible ? 'Hide stream key' : 'Show stream key'}
              onClick={() => setVisible(!visible)}
              edge="end"
            >
              {visible ? <VisibilityOff /> : <Visibility />}
            </IconButton>
          </InputAdornment>
        ),
      }}
    />
  );
}

/** Ticking elapsed time from a start timestamp. */
export function Elapsed({ startedAt }: { startedAt: string | null | undefined }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  if (!startedAt) {
    return (
      <Typography component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>
        —
      </Typography>
    );
  }
  const total = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const text = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  return (
    <Typography component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>
      {text}
    </Typography>
  );
}

export function OkDetail({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <CheckCircle fontSize="small" sx={{ color: ok ? 'success.main' : 'text.disabled' }} />
      <Typography variant="body2">{children}</Typography>
    </Stack>
  );
}
