import { unwrap, type paths } from '@soltec/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../access/SessionContext';

type DepartmentQuery = NonNullable<paths['/v1/departments']['get']['parameters']['query']>;

export function useDepartments(query: DepartmentQuery, enabled = true) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['departments', 'list', query],
    queryFn: async () => unwrap(await apiClient.GET('/v1/departments', { params: { query } })),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Creates a department, or renames it when `id` and `version` are given. */
export function useSaveDepartment() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; id?: string; version?: number }) =>
      input.id !== undefined && input.version !== undefined
        ? unwrap(
            await apiClient.PATCH('/v1/departments/{departmentId}', {
              params: { path: { departmentId: input.id } },
              body: { name: input.name, version: input.version },
            }),
          )
        : unwrap(await apiClient.POST('/v1/departments', { body: { name: input.name } })),
    // Users show the department name, so their lists refresh too.
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['departments'] });
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

/** Deactivates or reactivates a department; the list refreshes afterwards. */
export function useSetDepartmentActive() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ departmentId, active }: { departmentId: string; active: boolean }) =>
      unwrap(
        await apiClient.POST(
          active
            ? '/v1/departments/{departmentId}/reactivate'
            : '/v1/departments/{departmentId}/deactivate',
          { params: { path: { departmentId } } },
        ),
      ),
    // A refused deactivation refreshes too: the count of active users may have changed meanwhile.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['departments'] }),
  });
}
