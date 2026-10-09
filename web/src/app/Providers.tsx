import { CssBaseline, ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AuthSession } from '@soltec/shared';
import { useState, type ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { SessionProvider } from '../modules/access/SessionContext';
import { theme } from '../theme/theme';
import { session as browserSession } from './session';
import { useClearCacheOnSignOut } from './useClearCacheOnSignOut';

export function Providers({
  children,
  session = browserSession,
  router: Router = BrowserRouter,
}: {
  children: ReactNode;
  session?: AuthSession;
  router?: (props: { children: ReactNode }) => ReactNode;
}) {
  const [queryClient] = useState(() => new QueryClient());

  useClearCacheOnSignOut(session, queryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Router>
          <SessionProvider session={session}>{children}</SessionProvider>
        </Router>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
