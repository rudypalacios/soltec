import { createTheme } from '@mui/material/styles';

/**
 * Design tokens live here. The client pointed at the look of Gmail and StelOrder: light, calm and
 * dense. The palette below is a placeholder to be settled with the client (see ADR-0008).
 *
 * Desktop is the base. Below the `md` breakpoint the controls grow to at least 44 px, the size a finger needs.
 */
const base = createTheme({
  palette: {
    primary: { main: '#1a73e8' },
    background: { default: '#f6f8fc', paper: '#ffffff' },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
  },
});

export const theme = createTheme(base, {
  components: {
    MuiButton: {
      styleOverrides: {
        root: { [base.breakpoints.down('md')]: { minHeight: 44 } },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: { [base.breakpoints.down('md')]: { minWidth: 44, minHeight: 44 } },
      },
    },
    MuiCheckbox: {
      styleOverrides: {
        root: { [base.breakpoints.down('md')]: { padding: 11 } },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: { [base.breakpoints.down('md')]: { minHeight: 44 } },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        input: {
          [base.breakpoints.down('md')]: { minHeight: 24, paddingTop: 12, paddingBottom: 12 },
        },
      },
    },
  },
});
