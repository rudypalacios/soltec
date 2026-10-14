import { unwrap, type components, type paths } from '@soltec/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../access/SessionContext';

type ProductQuery = NonNullable<paths['/v1/products']['get']['parameters']['query']>;
export type ProductCreate = components['schemas']['ProductCreate'];
export type ProductUpdate = components['schemas']['ProductUpdate'];
export type BulkResult = components['schemas']['ProductBulkResult'];

export function useProducts(query: ProductQuery) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['products', 'list', query],
    queryFn: async () => unwrap(await apiClient.GET('/v1/products', { params: { query } })),
    placeholderData: keepPreviousData,
  });
}

export function useProduct(productId: string | undefined) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['products', 'detail', productId],
    queryFn: async () =>
      unwrap(
        await apiClient.GET('/v1/products/{productId}', {
          params: { path: { productId: productId ?? '' } },
        }),
      ),
    enabled: productId !== undefined,
    // The form works on a copy: refetching in the background would silently replace what the person is typing.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
}

/** One product priced at a given margin level, for «Ver con otro margen»: the server computes it from the cost. */
export function useProductAtLevel(
  productId: string,
  levelId: string | undefined,
  enabled: boolean,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['products', 'at-level', productId, levelId],
    queryFn: async () =>
      unwrap(
        await apiClient.GET('/v1/products/{productId}', {
          params: {
            path: { productId },
            query: levelId ? { margin_level_id: levelId } : {},
          },
        }),
      ),
    enabled: enabled && levelId !== undefined,
    refetchOnWindowFocus: false,
  });
}

export function useCreateProduct() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: ProductCreate) =>
      unwrap(await apiClient.POST('/v1/products', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useUpdateProduct(productId: string) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: ProductUpdate) =>
      unwrap(
        await apiClient.PATCH('/v1/products/{productId}', {
          params: { path: { productId } },
          body,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });
}

/** Deactivates or reactivates one product; the lists refresh afterwards. */
export function useSetProductActive() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, active }: { productId: string; active: boolean }) =>
      unwrap(
        await apiClient.POST(
          active ? '/v1/products/{productId}/reactivate' : '/v1/products/{productId}/deactivate',
          { params: { path: { productId } } },
        ),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });
}

/** Says the cost of one product was checked and stays the same. */
export function useConfirmProductCost() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (productId: string) =>
      unwrap(
        await apiClient.POST('/v1/products/{productId}/confirm-cost', {
          params: { path: { productId } },
        }),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });
}

/** What a bulk action does: to the products picked, or (reactivating) to what a supplier took down with it. */
export type BulkAction =
  | { kind: 'deactivate' | 'reactivate' | 'confirm-cost'; ids: string[] }
  | { kind: 'reactivate-supplier'; supplierId: string };

export function useBulkProducts() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: BulkAction): Promise<BulkResult> => {
      switch (action.kind) {
        case 'deactivate':
          return unwrap(
            await apiClient.POST('/v1/products/deactivate', { body: { ids: action.ids } }),
          );
        case 'reactivate':
          return unwrap(
            await apiClient.POST('/v1/products/reactivate', { body: { ids: action.ids } }),
          );
        case 'confirm-cost':
          return unwrap(
            await apiClient.POST('/v1/products/confirm-cost', { body: { ids: action.ids } }),
          );
        case 'reactivate-supplier':
          return unwrap(
            await apiClient.POST('/v1/products/reactivate', {
              body: { supplier_id: action.supplierId },
            }),
          );
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });
}

/** The lists a product form and filters choose from. Any internal session reads them (ADR-0024). */
export function useBrandOptions() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['products', 'options', 'brands'],
    queryFn: async () => unwrap(await apiClient.GET('/v1/brands/options')),
  });
}

export function useAreaOptions() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['products', 'options', 'areas'],
    queryFn: async () => unwrap(await apiClient.GET('/v1/areas/options')),
  });
}

export function useGroupOptions() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['products', 'options', 'groups'],
    queryFn: async () => unwrap(await apiClient.GET('/v1/product-groups/options')),
  });
}

export function useUnitOptions() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['products', 'options', 'units'],
    queryFn: async () => unwrap(await apiClient.GET('/v1/units-of-measure/options')),
  });
}

export function useMarginLevelOptions() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['products', 'options', 'margin-levels'],
    queryFn: async () => unwrap(await apiClient.GET('/v1/margin-levels/options')),
  });
}

/** The suppliers matching what was typed, searched on the server so a long list never has to be loaded whole. */
export function useSupplierOptions(text: string, enabled = true) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['suppliers', 'options', text],
    queryFn: async () =>
      unwrap(
        await apiClient.GET('/v1/suppliers/options', {
          params: { query: { q: text || undefined, limit: 20 } },
        }),
      ),
    placeholderData: keepPreviousData,
    enabled,
  });
}
