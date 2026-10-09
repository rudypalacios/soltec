import { Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

/** Title of a screen with its main actions: side by side on a desktop, stacked on a phone. */
export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={2}
      sx={{ mb: 3, alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between' }}
    >
      <Typography variant="h5" component="h1">
        {title}
      </Typography>
      {actions ? <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>{actions}</Box> : null}
    </Stack>
  );
}
