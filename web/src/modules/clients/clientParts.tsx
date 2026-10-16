import { Box, Typography } from '@mui/material';
import type { components } from '@soltec/shared';
import { color } from '../../theme/tokens';

type ClientType = components['schemas']['ClientType'];
type StatusRef = components['schemas']['StatusRef'];

export const TYPE_LABELS: Record<ClientType, string> = {
  prospect: 'Prospecto',
  customer: 'Cliente',
};

/** Prospect and customer as a pill, so a list that mixes them tells them apart at a glance. */
export function TypeTag({ type }: { type: ClientType }) {
  const customer = type === 'customer';
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-block',
        bgcolor: customer ? color.success.tint : color.primary.tint,
        color: customer ? color.success.main : color.primary.dark,
        fontSize: '0.75rem',
        fontWeight: 600,
        borderRadius: 999,
        px: 1,
        whiteSpace: 'nowrap',
      }}
    >
      {TYPE_LABELS[type]}
    </Box>
  );
}

/**
 * The client status as a dot in its own color and its name. The name carries the meaning; a long one is cut with «…»
 * (its whole text is in the `title`). A client without a status shows a dash.
 */
export function ClientStatusBadge({ status }: { status: StatusRef | null }) {
  if (!status) {
    return (
      <Typography component="span" variant="body2" color="text.secondary">
        —
      </Typography>
    );
  }
  return (
    <Box
      component="span"
      title={status.name}
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, minWidth: 0, maxWidth: '100%' }}
    >
      <Box
        component="span"
        aria-hidden
        sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: status.color, flexShrink: 0 }}
      />
      <Typography component="span" variant="body2" noWrap sx={{ minWidth: 0 }}>
        {status.name}
      </Typography>
    </Box>
  );
}

/** «+3» next to the responsible adviser when the client has more. */
export function MoreSellers({ count }: { count: number }) {
  if (count <= 1) {
    return null;
  }
  return (
    <Box
      component="span"
      title={`${count - 1} asesores más`}
      sx={{
        flexShrink: 0,
        bgcolor: color.surfaceMuted,
        color: 'text.secondary',
        fontSize: '0.75rem',
        fontWeight: 600,
        borderRadius: 999,
        px: 1,
      }}
    >
      +{count - 1}
    </Box>
  );
}
