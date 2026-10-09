import { QueryClient } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createTestSession } from '../test/fakeApi';
import { useClearCacheOnSignOut } from './useClearCacheOnSignOut';

describe('useClearCacheOnSignOut', () => {
  it('empties the cache when the session ends and not before', async () => {
    const { session } = createTestSession({
      'POST /v1/auth/logout': () => new Response(null, { status: 204 }),
    });
    await session.restore();
    const queryClient = new QueryClient();
    queryClient.setQueryData(['users'], ['someone else']);
    renderHook(() => useClearCacheOnSignOut(session, queryClient));

    expect(queryClient.getQueryData(['users'])).toEqual(['someone else']);
    await session.logout();

    expect(queryClient.getQueryData(['users'])).toBeUndefined();
  });

  it('stops listening when it is unmounted', async () => {
    const { session } = createTestSession({
      'POST /v1/auth/logout': () => new Response(null, { status: 204 }),
    });
    await session.restore();
    const queryClient = new QueryClient();
    queryClient.setQueryData(['users'], ['kept']);
    const { unmount } = renderHook(() => useClearCacheOnSignOut(session, queryClient));

    unmount();
    await session.logout();

    expect(queryClient.getQueryData(['users'])).toEqual(['kept']);
  });
});
