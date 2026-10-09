import { unwrap, type paths } from '@soltec/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from './SessionContext';

type UserQuery = NonNullable<paths['/v1/users']['get']['parameters']['query']>;

export function useUsers(query: UserQuery) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['users', query],
    queryFn: async () => unwrap(await apiClient.GET('/v1/users', { params: { query } })),
    placeholderData: keepPreviousData,
  });
}

export function useCreateUser() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      name: string;
      email: string;
      role_ids: string[];
      initial_password: string;
    }) => unwrap(await apiClient.POST('/v1/users', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

/** Deactivates or reactivates a user; the list refreshes afterwards. */
export function useSetUserActive() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, active }: { userId: string; active: boolean }) =>
      unwrap(
        await apiClient.POST(
          active ? '/v1/users/{userId}/reactivate' : '/v1/users/{userId}/deactivate',
          {
            params: { path: { userId } },
          },
        ),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}
