import { useMediaQuery, useTheme } from '@mui/material';

/**
 * True below the `md` breakpoint (900 px). The web is desktop-first: tables and side navigation are the base
 * layout and this switches to lists of cards and a drawer on a phone.
 */
export function useIsMobile(): boolean {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('md'));
}
