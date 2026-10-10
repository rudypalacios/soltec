import { unwrap, type components, type paths } from '@soltec/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../access/SessionContext';

type MarginLevelStatus = NonNullable<
  paths['/v1/margin-levels']['get']['parameters']['query']
>['status'];
export type PriceResult = components['schemas']['PriceResult'];

export function useMarginLevels(status: MarginLevelStatus = 'active', enabled = true) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['margin-levels', 'list', status],
    queryFn: async () =>
      unwrap(await apiClient.GET('/v1/margin-levels', { params: { query: { status } } })),
    enabled,
  });
}

/** Creates a margin level, or edits it when `id` and `version` are given. */
export function useSaveMarginLevel() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; rate: string; id?: string; version?: number }) =>
      input.id !== undefined && input.version !== undefined
        ? unwrap(
            await apiClient.PATCH('/v1/margin-levels/{marginLevelId}', {
              params: { path: { marginLevelId: input.id } },
              body: { name: input.name, rate: input.rate, version: input.version },
            }),
          )
        : unwrap(
            await apiClient.POST('/v1/margin-levels', {
              body: { name: input.name, rate: input.rate },
            }),
          ),
    // A new rate changes every computed price, so the simulator's answers go stale too.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['margin-levels'] }),
  });
}

/** Deactivates or reactivates a level; the list refreshes afterwards. */
export function useSetMarginLevelActive() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ marginLevelId, active }: { marginLevelId: string; active: boolean }) =>
      unwrap(
        await apiClient.POST(
          active
            ? '/v1/margin-levels/{marginLevelId}/reactivate'
            : '/v1/margin-levels/{marginLevelId}/deactivate',
          { params: { path: { marginLevelId } } },
        ),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['margin-levels'] }),
  });
}

export function useSetDefaultMarginLevel() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (marginLevelId: string) =>
      unwrap(
        await apiClient.POST('/v1/margin-levels/{marginLevelId}/set-default', {
          params: { path: { marginLevelId } },
        }),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['margin-levels'] }),
  });
}

/**
 * The server's price for a cost. It keeps the previous answer while the next one loads: the simulator still needs
 * the tax rates in it to preview the next cost at once.
 */
export function usePrice(cost: string, marginLevelId: string | null, enabled: boolean) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['margin-levels', 'price', cost, marginLevelId],
    queryFn: async () =>
      unwrap(
        await apiClient.POST('/v1/price/calculate', {
          body: { cost, margin_level_id: marginLevelId },
        }),
      ),
    placeholderData: keepPreviousData,
    enabled,
  });
}
