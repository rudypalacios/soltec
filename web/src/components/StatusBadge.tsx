import { Box, Typography } from '@mui/material';
import { color } from '../theme/tokens';

export type StatusTone = 'success' | 'warning' | 'neutral';

const DOT: Record<StatusTone, string> = {
  success: color.success.main,
  warning: color.warning.main,
  neutral: color.lineStrong,
};

/**
 * A record's state as a dot and its name. The word carries the meaning (the dot alone would not reach someone who
 * cannot tell the colours apart) and the dot makes a column of states readable at a glance.
 */
export function StatusBadge({ tone, label }: { tone: StatusTone; label: string }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      <Box
        component="span"
        aria-hidden
        sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: DOT[tone], flexShrink: 0 }}
      />
      <Typography component="span" variant="body2" sx={{ whiteSpace: 'nowrap' }}>
        {label}
      </Typography>
    </Box>
  );
}

/** The state of a record that is simply active or not. */
export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <StatusBadge tone={active ? 'success' : 'neutral'} label={active ? 'Activo' : 'Inactivo'} />
  );
}
