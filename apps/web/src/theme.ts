import { createTheme } from '@mui/material/styles';
import type { PaletteMode } from '@mui/material';

/**
 * Material + minimal design language: clean cards, generous spacing,
 * a red "live" accent and calm neutral surfaces.
 */
export function buildTheme(mode: PaletteMode) {
  return createTheme({
    palette: {
      mode,
      primary: { main: mode === 'light' ? '#c62828' : '#ef5350' },
      secondary: { main: mode === 'light' ? '#1565c0' : '#64b5f6' },
      success: { main: mode === 'light' ? '#2e7d32' : '#66bb6a' },
      warning: { main: mode === 'light' ? '#ed6c02' : '#ffa726' },
      background: {
        default: mode === 'light' ? '#f4f5f7' : '#0f1115',
        paper: mode === 'light' ? '#ffffff' : '#171a21',
      },
      divider: mode === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.10)',
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: 'Inter, Roboto, "Helvetica Neue", Arial, sans-serif',
      h4: { fontWeight: 700 },
      h5: { fontWeight: 700 },
      h6: { fontWeight: 600 },
      subtitle2: { fontWeight: 600 },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiCard: {
        styleOverrides: { root: { backgroundImage: 'none' } },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
      },
      MuiPaper: {
        styleOverrides: { root: { backgroundImage: 'none' } },
      },
      MuiChip: {
        styleOverrides: { root: { fontWeight: 600 } },
      },
    },
  });
}

export const lightTheme = buildTheme('light');
export const darkTheme = buildTheme('dark');
