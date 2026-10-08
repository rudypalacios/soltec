import { createTheme } from '@mui/material/styles';

/**
 * Design tokens live here. The client pointed at the look of Gmail and StelOrder: light, calm and
 * dense. The palette below is a placeholder to be settled with the client (see ADR-0008).
 */
export const theme = createTheme({
  palette: {
    primary: { main: '#1a73e8' },
    background: { default: '#f6f8fc', paper: '#ffffff' },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
  },
});
