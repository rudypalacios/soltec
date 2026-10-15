import { Box } from '@mui/material';
import { color } from '../theme/tokens';

/**
 * How an inactive record shows in any list, with three quiet signals so «Todos» still tells them apart: a stripe at the
 * left, a faint wash and grey text (the name keeps its colour), plus the «Inactivo» tag. Amber stays for the stale
 * cost, so the two never read as the same thing. `DataList` applies them to the rows that `isInactive` flags.
 */
export const INACTIVE_ROW = {
  bgcolor: color.inactive.wash,
  '& > td': { color: 'text.secondary' },
  '& > td:first-of-type': { boxShadow: `inset 3px 0 0 ${color.inactive.stripe}` },
  '&.MuiTableRow-hover:hover': { bgcolor: color.inactive.wash },
} as const;

/** The stripe and the wash alone, for a row that is not a table row (the compact list of a phone). */
export const INACTIVE_MARK = {
  bgcolor: color.inactive.wash,
  boxShadow: `inset 3px 0 0 ${color.inactive.stripe}`,
} as const;

/** The same signals on the card of a phone. */
export const INACTIVE_CARD = {
  bgcolor: color.inactive.wash,
  borderLeft: `3px solid ${color.inactive.stripe}`,
} as const;

export function InactiveTag() {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-block',
        bgcolor: color.error.tint,
        color: color.error.main,
        fontSize: '0.75rem',
        fontWeight: 600,
        borderRadius: 999,
        px: 1,
        whiteSpace: 'nowrap',
      }}
    >
      Inactivo
    </Box>
  );
}
