import { unwrap } from '@soltec/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useApiClient } from '../access/SessionContext';

/** How often the web asks the server what changed (ADR-0005). The hidden tab does not ask. */
export const POLL_MS = 60_000;

/**
 * The cheap question the web asks every minute: how many notifications are unread. When that number moves, the list
 * of notifications is read again, so a new notice shows up without anybody reloading.
 */
export function useUnreadCount(enabled = true) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const updates = useQuery({
    queryKey: ['updates'],
    queryFn: async () => unwrap(await apiClient.GET('/v1/updates')),
    enabled,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
  });

  const count = updates.data?.unread_count;
  const previous = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (count !== undefined && previous.current !== undefined && previous.current !== count) {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
    previous.current = count;
  }, [count, queryClient]);

  return count ?? 0;
}

/** The notifications of the signed-in person, newest first; each page asks for the ones older than where it ended. */
export function useNotifications(options: {
  unreadOnly?: boolean;
  limit?: number;
  enabled?: boolean;
}) {
  const apiClient = useApiClient();
  const { unreadOnly = false, limit = 25, enabled = true } = options;
  return useInfiniteQuery({
    queryKey: ['notifications', { unreadOnly, limit }],
    queryFn: async ({ pageParam }) =>
      unwrap(
        await apiClient.GET('/v1/notifications', {
          params: {
            query: {
              limit,
              ...(unreadOnly ? { unread: 'true' as const } : {}),
              ...(pageParam ? { before: pageParam } : {}),
            },
          },
        }),
      ),
    initialPageParam: '',
    getNextPageParam: (last) => last.meta.next_cursor ?? undefined,
    enabled,
  });
}

function useRefreshNotifications() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    await queryClient.invalidateQueries({ queryKey: ['updates'] });
  };
}

/** Opening a notification marks it read. */
export function useMarkRead() {
  const apiClient = useApiClient();
  const refresh = useRefreshNotifications();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        await apiClient.POST('/v1/notifications/{notificationId}/read', {
          params: { path: { notificationId: id } },
        }),
      ),
    onSuccess: refresh,
  });
}

export function useMarkAllRead() {
  const apiClient = useApiClient();
  const refresh = useRefreshNotifications();
  return useMutation({
    mutationFn: async () => unwrap(await apiClient.POST('/v1/notifications/read-all')),
    onSuccess: refresh,
  });
}
