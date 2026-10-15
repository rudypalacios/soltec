import { unwrap, type components, type paths } from '@soltec/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../access/SessionContext';

type BundleQuery = NonNullable<paths['/v1/bundles']['get']['parameters']['query']>;
export type BundleCreate = components['schemas']['BundleCreate'];
export type BundleUpdate = components['schemas']['BundleUpdate'];
export type BundleBulkResult = components['schemas']['BundleBulkResult'];

export function useBundles(query: BundleQuery) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['bundles', 'list', query],
    queryFn: async () => unwrap(await apiClient.GET('/v1/bundles', { params: { query } })),
    placeholderData: keepPreviousData,
  });
}

export function useBundle(bundleId: string | undefined) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['bundles', 'detail', bundleId],
    queryFn: async () =>
      unwrap(
        await apiClient.GET('/v1/bundles/{bundleId}', {
          params: { path: { bundleId: bundleId ?? '' } },
        }),
      ),
    enabled: bundleId !== undefined,
    // The form works on a copy: refetching in the background would silently replace what the person is typing.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
}

/**
 * The currency of the prices and costs. Only the list carries it (`meta.currency_code`, from the financial settings),
 * so the form asks for the smallest page of it rather than for settings the person may not be allowed to read.
 */
export function useBundleCurrency(): string {
  const apiClient = useApiClient();
  const result = useQuery({
    queryKey: ['bundles', 'currency'],
    queryFn: async () =>
      unwrap(await apiClient.GET('/v1/bundles', { params: { query: { per_page: 1 } } })),
    staleTime: 10 * 60 * 1000,
  });
  return result.data?.meta.currency_code ?? 'GTQ';
}

/** The products a bundle can be built from, searched on the server; `exclude` leaves out the ones already in. */
export function useBundleCandidates(text: string, exclude: string[], enabled: boolean) {
  const apiClient = useApiClient();
  const excluded = exclude.join(',');
  return useQuery({
    queryKey: ['bundles', 'candidates', text, excluded],
    queryFn: async () =>
      unwrap(
        await apiClient.GET('/v1/bundles/candidates', {
          params: {
            query: {
              q: text || undefined,
              exclude: excluded || undefined,
              limit: 20,
            },
          },
        }),
      ),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** One bundle priced at a given margin level, for «Ver con otro margen»: the server computes it from the cost. */
export function useBundleAtLevel(bundleId: string, levelId: string | undefined, enabled: boolean) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['bundles', 'at-level', bundleId, levelId],
    queryFn: async () =>
      unwrap(
        await apiClient.GET('/v1/bundles/{bundleId}', {
          params: { path: { bundleId }, query: levelId ? { margin_level_id: levelId } : {} },
        }),
      ),
    enabled: enabled && levelId !== undefined,
    refetchOnWindowFocus: false,
  });
}

export function useCreateBundle() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: BundleCreate) => unwrap(await apiClient.POST('/v1/bundles', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bundles'] }),
  });
}

export function useUpdateBundle(bundleId: string) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: BundleUpdate) =>
      unwrap(
        await apiClient.PATCH('/v1/bundles/{bundleId}', {
          params: { path: { bundleId } },
          body,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bundles'] }),
  });
}

/** Deactivates or reactivates one bundle; the lists refresh afterwards. */
export function useSetBundleActive() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ bundleId, active }: { bundleId: string; active: boolean }) =>
      unwrap(
        await apiClient.POST(
          active ? '/v1/bundles/{bundleId}/reactivate' : '/v1/bundles/{bundleId}/deactivate',
          { params: { path: { bundleId } } },
        ),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['bundles'] }),
  });
}

/** Deactivates or reactivates the bundles picked, in one call. */
export function useBulkBundles() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      kind,
      ids,
    }: {
      kind: 'deactivate' | 'reactivate';
      ids: string[];
    }): Promise<BundleBulkResult> =>
      unwrap(
        await apiClient.POST(
          kind === 'deactivate' ? '/v1/bundles/deactivate' : '/v1/bundles/reactivate',
          { body: { ids } },
        ),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['bundles'] }),
  });
}
