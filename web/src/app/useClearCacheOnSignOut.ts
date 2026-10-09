import type { AuthSession } from '@soltec/shared';
import type { QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

/** Whoever signs in next must not see the previous person's cached lists: sign-out empties the cache. */
export function useClearCacheOnSignOut(session: AuthSession, queryClient: QueryClient): void {
  useEffect(
    () =>
      session.subscribe(() => {
        if (session.getState().status === 'anonymous') {
          queryClient.clear();
        }
      }),
    [session, queryClient],
  );
}
