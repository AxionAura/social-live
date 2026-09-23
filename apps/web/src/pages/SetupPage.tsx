import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Podcasts from '@mui/icons-material/Podcasts';
import { ApiError } from '../api/client.js';
import { useAuth } from '../providers/AuthProvider.js';
import { AuthShell } from '../components/Layout.js';

export default function SetupPage() {
  const { setup } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await setup({ username, email: email || undefined, password });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Setup failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <Card sx={{ width: '100%', maxWidth: 440 }}>
        <CardContent sx={{ p: 4, display: 'grid', gap: 2.5 }}>
          <Stack alignItems="center" spacing={1}>
            <Box
              sx={(theme) => ({
                width: 52,
                height: 52,
                borderRadius: 3,
                display: 'grid',
                placeItems: 'center',
                color: '#fff',
                background: `linear-gradient(135deg, ${theme.palette.primary.main}, #8e0000)`,
              })}
            >
              <Podcasts />
            </Box>
            <Typography variant="h5">Welcome to SocialLive</Typography>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              Create your local administrator account. It is stored only on this machine — no cloud, no external accounts.
            </Typography>
          </Stack>

          {error ? <Alert severity="error">{error}</Alert> : null}

          <form onSubmit={handleSubmit} noValidate>
            <Stack spacing={2}>
              <TextField
                label="Username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                helperText="Letters, digits, dot, dash and underscore (3–64 chars)"
                autoComplete="username"
                autoFocus
                required
                fullWidth
              />
              <TextField
                label="Email (optional)"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                fullWidth
              />
              <TextField
                label="Password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                helperText="At least 8 characters"
                autoComplete="new-password"
                required
                fullWidth
              />
              <TextField
                label="Confirm password"
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
                required
                fullWidth
              />
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={busy || !username || !password || !confirm}
              >
                {busy ? 'Creating account…' : 'Create account'}
              </Button>
            </Stack>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
