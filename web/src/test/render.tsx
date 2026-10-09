import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { AuthSession } from '@soltec/shared';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { App } from '../app/App';
import { SessionProvider } from '../modules/access/SessionContext';
import { theme } from '../theme/theme';

/** Shows the current path so a test can say where the app ended up. */
function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

/** The whole application on a route, with a session wired to a fake API. */
export function renderApp(
  session: AuthSession,
  entry: string | { pathname: string; state?: unknown },
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <MemoryRouter initialEntries={[entry]}>
          <SessionProvider session={session}>
            <App />
            <Where />
          </SessionProvider>
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

/**
 * Makes `useMediaQuery` believe the window is this wide. jsdom has no layout, so the desktop (table) or phone (cards)
 * choice of a screen is decided by this width. Restore with `vi.unstubAllGlobals()`.
 */
export function setViewportWidth(width: number): void {
  const matches = (query: string): boolean => {
    const max = /max-width:\s*([\d.]+)px/.exec(query);
    const min = /min-width:\s*([\d.]+)px/.exec(query);
    return (!max?.[1] || width <= Number(max[1])) && (!min?.[1] || width >= Number(min[1]));
  };
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matches(query),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
    onchange: null,
  }));
}
