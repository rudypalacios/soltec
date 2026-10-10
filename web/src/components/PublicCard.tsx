import { Box, Card, CardContent, Typography } from '@mui/material';
import type { ReactNode } from 'react';

/** The frame of the screens that need no session (sign in, invitation, password recovery): a centred card. */
export function PublicCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        placeItems: { xs: 'start center', sm: 'center' },
        minHeight: '100vh',
        p: 2,
      }}
    >
      <Card sx={{ width: '100%', maxWidth: 400 }} elevation={0} variant="outlined">
        <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
          <Typography variant="h5" component="h1">
            {title}
          </Typography>
          {subtitle ? (
            <Typography color="text.secondary" sx={{ mb: 2.5 }}>
              {subtitle}
            </Typography>
          ) : (
            <Box sx={{ mb: 2.5 }} />
          )}
          {children}
        </CardContent>
      </Card>
    </Box>
  );
}
