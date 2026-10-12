import { unwrap, type paths } from '@soltec/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useApiClient } from '../access/SessionContext';

export type AuditQuery = Omit<
  NonNullable<paths['/v1/audit-logs']['get']['parameters']['query']>,
  'cursor' | 'limit'
>;

/** The audit log newest first; each page asks for the entries older than where the previous one ended. */
export function useAuditLog(query: AuditQuery, enabled: boolean) {
  const apiClient = useApiClient();
  return useInfiniteQuery({
    queryKey: ['audit', query],
    queryFn: async ({ pageParam }) =>
      unwrap(
        await apiClient.GET('/v1/audit-logs', {
          params: { query: { ...query, ...(pageParam ? { cursor: pageParam } : {}) } },
        }),
      ),
    initialPageParam: '',
    getNextPageParam: (last) => last.meta.next_cursor ?? undefined,
    enabled,
  });
}
