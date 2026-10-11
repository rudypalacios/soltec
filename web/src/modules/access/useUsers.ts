import { unwrap, unwrapEmpty, type components, type paths } from '@soltec/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from './SessionContext';

type UserQuery = NonNullable<paths['/v1/users']['get']['parameters']['query']>;
type UserUpdate = components['schemas']['UserUpdate'];
type UserCreate = components['schemas']['UserCreate'];

export function useUsers(query: UserQuery) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['users', query],
    queryFn: async () => unwrap(await apiClient.GET('/v1/users', { params: { query } })),
    placeholderData: keepPreviousData,
  });
}

export function useUser(userId: string | undefined) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['users', 'detail', userId],
    queryFn: async () =>
      unwrap(
        await apiClient.GET('/v1/users/{userId}', { params: { path: { userId: userId ?? '' } } }),
      ),
    enabled: userId !== undefined,
    // The form works on a copy: refetching in the background would silently replace what the person is typing.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
}

export function useUpdateUser(userId: string) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: UserUpdate) =>
      unwrap(await apiClient.PATCH('/v1/users/{userId}', { params: { path: { userId } }, body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

/** Sends the invitation email again; the list refreshes because the old link stopped working. */
export function useResendInvitation() {
  const apiClient = useApiClient();
  return useMutation({
    mutationFn: async (userId: string) =>
      unwrapEmpty(
        await apiClient.POST('/v1/users/{userId}/invite', { params: { path: { userId } } }),
      ),
  });
}

export function useCreateUser() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: UserCreate) => unwrap(await apiClient.POST('/v1/users', { body })),
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

/** Removes the lock of a user who failed to sign in too many times; the list refreshes afterwards. */
export function useUnlockUser() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) =>
      unwrap(await apiClient.POST('/v1/users/{userId}/unlock', { params: { path: { userId } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}
