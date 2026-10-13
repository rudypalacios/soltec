import { unwrap, type components, type paths } from '@soltec/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../access/SessionContext';

type SupplierQuery = NonNullable<paths['/v1/suppliers']['get']['parameters']['query']>;
export type SupplierCreate = components['schemas']['SupplierCreate'];
export type SupplierUpdate = components['schemas']['SupplierUpdate'];

export function useSuppliers(query: SupplierQuery) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['suppliers', 'list', query],
    queryFn: async () => unwrap(await apiClient.GET('/v1/suppliers', { params: { query } })),
    placeholderData: keepPreviousData,
  });
}

export function useSupplier(supplierId: string | undefined) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['suppliers', 'detail', supplierId],
    queryFn: async () =>
      unwrap(
        await apiClient.GET('/v1/suppliers/{supplierId}', {
          params: { path: { supplierId: supplierId ?? '' } },
        }),
      ),
    enabled: supplierId !== undefined,
    // The form works on a copy: refetching in the background would silently replace what the person is typing.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
}

export function useCreateSupplier() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: SupplierCreate) =>
      unwrap(await apiClient.POST('/v1/suppliers', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}

export function useUpdateSupplier(supplierId: string) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: SupplierUpdate) =>
      unwrap(
        await apiClient.PATCH('/v1/suppliers/{supplierId}', {
          params: { path: { supplierId } },
          body,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}

/** Deactivates or reactivates a supplier; the list refreshes afterwards. */
export function useSetSupplierActive() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ supplierId, active }: { supplierId: string; active: boolean }) =>
      unwrap(
        await apiClient.POST(
          active
            ? '/v1/suppliers/{supplierId}/reactivate'
            : '/v1/suppliers/{supplierId}/deactivate',
          { params: { path: { supplierId } } },
        ),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}
