import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider as MuiThemeProvider } from '@mui/material';
import { ThemeProvider as StyledThemeProvider } from 'styled-components';
import { theme } from '@/theme';
import { App } from '@/App';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Корневой элемент #root не найден.');

createRoot(rootElement).render(
  <StrictMode>
    <MuiThemeProvider theme={theme}>
      <StyledThemeProvider theme={theme}>
        <CssBaseline />
        <App />
      </StyledThemeProvider>
    </MuiThemeProvider>
  </StrictMode>
);
