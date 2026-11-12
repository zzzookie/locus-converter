import { createTheme } from '@mui/material/styles';

/** Тёмная тема приложения в духе Locus Map (акценты — оранжевый и синий). */
export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#ff7a1a' },
    secondary: { main: '#2ea8ff' },
    success: { main: '#4cc38a' },
    error: { main: '#ff5d5d' },
    background: { default: '#12151a', paper: '#1c2129' },
    text: { primary: '#e7ecf3', secondary: '#93a1b4' },
    divider: '#313a46',
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: '"Segoe UI", system-ui, Roboto, Arial, sans-serif',
    fontSize: 14,
  },
  components: {
    MuiPaper: {
      styleOverrides: { root: { backgroundImage: 'none' } },
    },
    MuiOutlinedInput: {
      styleOverrides: { root: { background: '#232a34' } },
    },
  },
});
