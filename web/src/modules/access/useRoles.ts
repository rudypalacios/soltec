import { unwrap, type components, type paths } from '@soltec/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from './SessionContext';

type RoleQuery = NonNullable<paths['/v1/roles']['get']['parameters']['query']>;
type RoleCreate = components['schemas']['RoleCreate'];
type RoleUpdate = components['schemas']['RoleUpdate'];

export function useRoles(query: RoleQuery) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['roles', 'list', query],
    queryFn: async () => unwrap(await apiClient.GET('/v1/roles', { params: { query } })),
    placeholderData: keepPreviousData,
  });
}

export function useRole(roleId: string | undefined) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['roles', 'detail', roleId],
    queryFn: async () =>
      unwrap(
        await apiClient.GET('/v1/roles/{roleId}', { params: { path: { roleId: roleId ?? '' } } }),
      ),
    enabled: roleId !== undefined,
    // The form works on a copy: refetching in the background would silently replace what the person is typing.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
}

/** The modules and the verbs the permission matrix is built from. They only change with a deployment. */
export function useAccessCatalogs() {
  const apiClient = useApiClient();
  const resources = useQuery({
    queryKey: ['catalogs', 'resources'],
    queryFn: async () => unwrap(await apiClient.GET('/v1/resources')),
    staleTime: Infinity,
  });
  const permissions = useQuery({
    queryKey: ['catalogs', 'permissions'],
    queryFn: async () => unwrap(await apiClient.GET('/v1/permissions')),
    staleTime: Infinity,
  });
  return { resources, permissions };
}

/** The widgets a profile can put on the home screen. They only change with a deployment. */
export function useWidgetCatalog() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['catalogs', 'widgets'],
    queryFn: async () => unwrap(await apiClient.GET('/v1/widgets')),
    staleTime: Infinity,
  });
}

export function useCreateRole() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: RoleCreate) => unwrap(await apiClient.POST('/v1/roles', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
  });
}

export function useUpdateRole(roleId: string) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: RoleUpdate) =>
      unwrap(await apiClient.PATCH('/v1/roles/{roleId}', { params: { path: { roleId } }, body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
  });
}

/** Deactivates or reactivates a role; the list refreshes afterwards. */
export function useSetRoleActive() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ roleId, active }: { roleId: string; active: boolean }) =>
      unwrap(
        await apiClient.POST(
          active ? '/v1/roles/{roleId}/reactivate' : '/v1/roles/{roleId}/deactivate',
          {
            params: { path: { roleId } },
          },
        ),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
  });
}
