import { createTheme } from '@mui/material/styles';
import { color, density, font, radius, touchQuery } from './tokens';

/**
 * The MUI theme, built from `tokens.ts` (ADR-0018). Desktop is the base: 14 px text and 40 px fields. Under
 * `touchQuery` the text goes to 16 px (below that iOS zooms the page when a field is focused) and the controls
 * grow to what a finger needs.
 */
const base = createTheme({
  palette: {
    primary: color.primary,
    success: { main: color.success.main },
    warning: { main: color.warning.main },
    error: { main: color.error.main },
    text: { primary: color.ink, secondary: color.inkMuted },
    background: { default: color.canvas, paper: color.surface },
    divider: color.line,
  },
  shape: { borderRadius: radius.control },
  typography: {
    fontFamily: font.family,
    fontSize: 14,
    h5: { fontSize: '1.375rem', lineHeight: 1.27, fontWeight: 600, letterSpacing: '-0.01em' },
    h6: { fontSize: '1rem', lineHeight: 1.5, fontWeight: 600 },
    body1: {
      fontSize: '0.875rem',
      lineHeight: 1.43,
      [touchQuery]: { fontSize: '1rem', lineHeight: 1.5 },
    },
    body2: {
      fontSize: '0.8125rem',
      lineHeight: 1.45,
      [touchQuery]: { fontSize: '0.9375rem', lineHeight: 1.47 },
    },
    caption: { fontSize: '0.75rem', lineHeight: 1.33, [touchQuery]: { fontSize: '0.8125rem' } },
    button: { fontSize: '0.875rem', fontWeight: 600, textTransform: 'none', letterSpacing: 0 },
  },
});

/** Surfaces and tables carry a border instead of a shadow. */
const outlinedSurface = { border: `1px solid ${color.line}`, borderRadius: radius.surface };

export const theme = createTheme(base, {
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { fontVariantNumeric: 'tabular-nums' },
        // The ring is for keyboard users: a click keeps its own state and shows no ring.
        ':focus-visible': { outline: `2px solid ${color.primary.main}`, outlineOffset: 2 },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: radius.control, [touchQuery]: { minHeight: density.targetTouch } },
        // The secondary button (Cancelar, Volver) is an outline in a neutral tone, so it reads as a button and not as a link.
        outlinedInherit: { borderColor: color.lineStrong },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: { [touchQuery]: { minWidth: density.targetTouch, minHeight: density.targetTouch } },
      },
    },
    MuiCheckbox: { styleOverrides: { root: { [touchQuery]: { padding: 11 } } } },
    MuiMenuItem: {
      styleOverrides: { root: { [touchQuery]: { minHeight: density.targetTouch } } },
    },
    MuiPaper: {
      styleOverrides: {
        outlined: outlinedSurface,
        rounded: { borderRadius: radius.surface },
      },
    },
    MuiCard: { styleOverrides: { root: { ...outlinedSurface, boxShadow: 'none' } } },

    // Fields: 40 px on desktop, 48 px on touch. The label offset follows the height of the small size.
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: radius.control,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: color.lineStrong },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: color.ink },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: color.primary.main,
            borderWidth: 2,
          },
          '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: color.error.main },
          [touchQuery]: { fontSize: '1rem' },
        },
        input: {
          [touchQuery]: { paddingTop: 12.5, paddingBottom: 12.5 },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          [touchQuery]: {
            '&.MuiInputLabel-sizeSmall:not(.MuiInputLabel-shrink)': {
              transform: 'translate(14px, 12.5px)',
            },
          },
        },
      },
    },
    // The autocomplete sets its own padding, so it needs the same 48 px on touch as a plain field.
    MuiAutocomplete: {
      styleOverrides: {
        root: {
          [touchQuery]: {
            '& .MuiOutlinedInput-root.MuiInputBase-sizeSmall': {
              paddingTop: 10,
              paddingBottom: 10,
            },
          },
        },
      },
    },
    MuiFormHelperText: { styleOverrides: { root: { marginLeft: 2, marginRight: 2 } } },

    // Tables: header on a muted band, rows of about 40 px, no zebra.
    MuiTableCell: {
      styleOverrides: {
        root: { padding: '10px 12px', borderBottomColor: color.line, fontSize: '0.875rem' },
        head: {
          backgroundColor: color.surfaceMuted,
          color: color.inkMuted,
          fontWeight: 600,
          fontSize: '0.8125rem',
          whiteSpace: 'nowrap',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&.MuiTableRow-hover:hover': { backgroundColor: color.canvas },
          '&:last-child td': { borderBottom: 0 },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: radius.control, fontWeight: 500 },
        colorDefault: { backgroundColor: color.surfaceMuted },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: radius.control, alignItems: 'center' },
        standardError: { backgroundColor: color.error.tint, color: color.ink },
        standardWarning: { backgroundColor: color.warning.tint, color: color.ink },
        standardSuccess: { backgroundColor: color.success.tint, color: color.ink },
        standardInfo: { backgroundColor: color.primary.tint, color: color.ink },
      },
    },
    MuiDialog: {
      styleOverrides: { paper: { borderRadius: radius.surface, boxShadow: base.shadows[8] } },
    },
    MuiDialogTitle: { styleOverrides: { root: { fontSize: '1.125rem', fontWeight: 600 } } },
    MuiDrawer: {
      styleOverrides: {
        paper: { backgroundColor: color.surface, borderRight: `1px solid ${color.line}` },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { backgroundColor: color.surface, color: color.ink } },
    },
    MuiMenu: { styleOverrides: { paper: { boxShadow: base.shadows[8] } } },
    MuiLink: { styleOverrides: { root: { fontWeight: 500 } } },
  },
});
