import type { AuthSession } from '@soltec/shared';
import type { QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

/** Queries that hold nothing of a person (the brand is public), so a sign-out keeps them and nothing flashes. */
const PUBLIC_QUERIES = ['branding'];

/**
 * Whoever signs in next must not see the previous person's cached lists: sign-out empties the cache, except the public
 * brand, which is the same for everybody (clearing it made the logo disappear and load again on every sign-out).
 */
export function useClearCacheOnSignOut(session: AuthSession, queryClient: QueryClient): void {
  useEffect(
    () =>
      session.subscribe(() => {
        if (session.getState().status === 'anonymous') {
          queryClient.removeQueries({
            predicate: (query) => !PUBLIC_QUERIES.includes(String(query.queryKey[0])),
          });
        }
      }),
    [session, queryClient],
  );
}
