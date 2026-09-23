import { useMemo, useState, type ReactNode } from 'react';
import { Link as RouterLink, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AppBar,
  Avatar,
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
  List,
} from '@mui/material';
import BrightnessAuto from '@mui/icons-material/BrightnessAuto';
import Cast from '@mui/icons-material/Cast';
import DarkMode from '@mui/icons-material/DarkMode';
import Dashboard from '@mui/icons-material/Dashboard';
import History from '@mui/icons-material/History';
import LightMode from '@mui/icons-material/LightMode';
import Logout from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import NotificationsNone from '@mui/icons-material/NotificationsNone';
import Podcasts from '@mui/icons-material/Podcasts';
import Search from '@mui/icons-material/Search';
import Settings from '@mui/icons-material/Settings';
import VideoLibrary from '@mui/icons-material/VideoLibrary';
import type { SxProps, Theme } from '@mui/material/styles';
import { APP_NAME } from '@social-live/shared';
import { useAuth } from '../providers/AuthProvider.js';
import { useNotifications } from '../providers/NotificationsProvider.js';
import { useThemeMode } from '../providers/ThemeModeProvider.js';
import { formatDateTime } from '../lib/format.js';

const DRAWER_WIDTH = 240;

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: <Dashboard /> },
  { to: '/streams', label: 'Streams', icon: <Podcasts /> },
  { to: '/videos', label: 'Videos', icon: <VideoLibrary /> },
  { to: '/destinations', label: 'Destinations', icon: <Cast /> },
  { to: '/history', label: 'History', icon: <History /> },
  { to: '/settings', label: 'Settings', icon: <Settings /> },
];

function BrandMark() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
      <Box
        sx={(theme) => ({
          width: 34,
          height: 34,
          borderRadius: 2,
          display: 'grid',
          placeItems: 'center',
          color: '#fff',
          background: `linear-gradient(135deg, ${theme.palette.primary.main}, #8e0000)`,
        })}
      >
        <Podcasts fontSize="small" />
      </Box>
      <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: '-0.01em' }}>
        {APP_NAME}
      </Typography>
    </Box>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const { mode, setMode } = useThemeMode();
  const { recent } = useNotifications();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuAnchor, setUserMenuAnchor] = useState<HTMLElement | null>(null);
  const [themeMenuAnchor, setThemeMenuAnchor] = useState<HTMLElement | null>(null);
  const [bellAnchor, setBellAnchor] = useState<HTMLElement | null>(null);

  const drawer = (
    <Box>
      <Toolbar sx={{ px: 2 }}>
        <BrandMark />
      </Toolbar>
      <Divider />
      <List sx={{ px: 1.5, py: 1 }}>
        {NAV_ITEMS.map((item) => (
          <ListItemButton
            key={item.to}
            component={NavLink}
            to={item.to}
            end={item.to === '/'}
            onClick={() => setMobileOpen(false)}
            sx={(theme) => ({
              borderRadius: 2,
              mb: 0.5,
              '&.active': {
                bgcolor: theme.palette.mode === 'light' ? 'rgba(198,40,40,0.08)' : 'rgba(239,83,80,0.14)',
                color: theme.palette.primary.main,
                '& .MuiListItemIcon-root': { color: theme.palette.primary.main },
              },
            })}
          >
            <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 600 }} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh', bgcolor: 'background.default' }}>
      <AppBar position="fixed" color="inherit" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
        <Toolbar sx={{ gap: 1 }}>
          <IconButton edge="start" onClick={() => setMobileOpen(true)} sx={{ display: { md: 'none' } }}>
            <MenuIcon />
          </IconButton>
          <Box component={RouterLink} to="/" sx={{ textDecoration: 'none', color: 'inherit', display: { xs: 'none', sm: 'block' } }}>
            <BrandMark />
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          <IconButton onClick={(e) => setBellAnchor(e.currentTarget)}>
            <NotificationsNone />
          </IconButton>
          <IconButton onClick={(e) => setThemeMenuAnchor(e.currentTarget)}>
            {mode === 'system' ? <BrightnessAuto /> : mode === 'dark' ? <DarkMode /> : <LightMode />}
          </IconButton>
          <Tooltip title={user?.username ?? ''}>
            <IconButton onClick={(e) => setUserMenuAnchor(e.currentTarget)} size="small">
              <Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.main', fontSize: 15 }}>
                {(user?.username ?? '?').slice(0, 1).toUpperCase()}
              </Avatar>
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: DRAWER_WIDTH } }}
      >
        {drawer}
      </Drawer>
      <Drawer
        variant="permanent"
        open
        sx={{
          display: { xs: 'none', md: 'block' },
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, borderRight: '1px solid', borderColor: 'divider' },
        }}
      >
        {drawer}
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, p: { xs: 2, sm: 3 } }}>
        <Toolbar />
        <Outlet />
      </Box>

      <Menu anchorEl={bellAnchor} open={Boolean(bellAnchor)} onClose={() => setBellAnchor(null)}>
        <Box sx={{ px: 2, py: 1, minWidth: 300 }}>
          <Typography variant="subtitle2">Recent activity</Typography>
        </Box>
        <Divider />
        {recent.length === 0 ? (
          <MenuItem disabled>No recent events</MenuItem>
        ) : (
          recent.slice(0, 8).map((notification) => (
            <MenuItem key={notification.id} sx={{ display: 'block', py: 1 }}>
              <Chip size="small" color={notification.severity === 'error' ? 'error' : notification.severity === 'success' ? 'success' : 'default'} label={notification.severity.toUpperCase()} sx={{ mr: 1, height: 20 }} />
              {notification.message}
              <Typography variant="caption" display="block" color="text.secondary">
                {formatDateTime(notification.ts)}
              </Typography>
            </MenuItem>
          ))
        )}
      </Menu>

      <Menu anchorEl={themeMenuAnchor} open={Boolean(themeMenuAnchor)} onClose={() => setThemeMenuAnchor(null)}>
        {(
          [
            ['light', 'Light', <LightMode key="l" fontSize="small" />],
            ['dark', 'Dark', <DarkMode key="d" fontSize="small" />],
            ['system', 'System', <BrightnessAuto key="s" fontSize="small" />],
          ] as const
        ).map(([value, label, icon]) => (
          <MenuItem
            key={value}
            selected={mode === value}
            onClick={() => {
              setMode(value);
              setThemeMenuAnchor(null);
            }}
          >
            {icon}
            <Box sx={{ ml: 1 }}>{label}</Box>
          </MenuItem>
        ))}
      </Menu>

      <Menu
        anchorEl={userMenuAnchor}
        open={Boolean(userMenuAnchor)}
        onClose={() => setUserMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle2">{user?.username}</Typography>
          <Typography variant="caption" color="text.secondary">
            {user?.email || 'Local administrator'}
          </Typography>
        </Box>
        <Divider />
        <MenuItem
          onClick={() => {
            setUserMenuAnchor(null);
            navigate('/settings');
          }}
        >
          <Settings fontSize="small" />
          <Box sx={{ ml: 1 }}>Settings</Box>
        </MenuItem>
        <MenuItem
          onClick={async () => {
            setUserMenuAnchor(null);
            await logout();
            navigate('/login');
          }}
        >
          <Logout fontSize="small" />
          <Box sx={{ ml: 1 }}>Log out</Box>
        </MenuItem>
      </Menu>
    </Box>
  );
}

/** Route guard: requires an authenticated session (and finished setup). */
export function AuthGuard() {
  const { loading, user, needsSetup } = useAuth();
  const location = useLocation();
  const memorized = useMemo(() => {
    if (loading) {
      return (
        <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
          <Typography color="text.secondary">Loading…</Typography>
        </Box>
      );
    }
    if (needsSetup) return <Navigate to="/setup" replace />;
    if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    return <Outlet />;
  }, [loading, user, needsSetup, location.pathname]);
  return memorized;
}

/** Route guard for /login and /setup. */
export function GuestGuard({ children, page }: { children: ReactNode; page: 'login' | 'setup' }) {
  const { loading, user, needsSetup } = useAuth();
  if (loading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '100dvh' }}>
        <Typography color="text.secondary">Loading…</Typography>
      </Box>
    );
  }
  if (user) return <Navigate to="/" replace />;
  if (needsSetup && page === 'login') return <Navigate to="/setup" replace />;
  if (!needsSetup && page === 'setup') return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={(theme) => ({
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        p: 2,
        bgcolor: theme.palette.background.default,
      })}
    >
      {children}
    </Box>
  );
}

export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <TextField
      size="small"
      value={value}
      placeholder={placeholder ?? 'Search…'}
      onChange={(event) => onChange(event.target.value)}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <Search fontSize="small" />
          </InputAdornment>
        ),
      }}
      sx={{ width: { xs: '100%', sm: 280 } }}
    />
  );
}
