import { unwrap, type components, type paths } from '@soltec/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../access/SessionContext';
import type { ParameterValue, ParameterView } from './parameterViews';

type ListQuery = NonNullable<paths['/v1/segments']['get']['parameters']['query']>;
type ParameterPage = { data: ParameterValue[]; meta: components['schemas']['PageMeta'] };

// The five parameters have the same routes and bodies, and only the path placeholder differs. The generated client
// types each path on its own, so these helpers state the shared shape once, through the `segments` one.
const listPath = (view: ParameterView) => `/v1/${view.slug}` as '/v1/segments';
const itemPath = (view: ParameterView) =>
  `/v1/${view.slug}/{${view.idParam}}` as '/v1/segments/{segmentId}';
const setActivePath = (view: ParameterView, active: boolean) =>
  `/v1/${view.slug}/{${view.idParam}}/${active ? 'reactivate' : 'deactivate'}` as
    '/v1/segments/{segmentId}/reactivate' | '/v1/segments/{segmentId}/deactivate';
const itemParams = (view: ParameterView, id: string) =>
  ({ [view.idParam]: id }) as { segmentId: string };

export function useParameterValues(view: ParameterView, query: ListQuery) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['parameters', view.slug, 'list', query],
    queryFn: async () =>
      unwrap(await apiClient.GET(listPath(view), { params: { query } })) as ParameterPage,
    placeholderData: keepPreviousData,
  });
}

/** Creates a value, or edits it when `id` and `version` are given. */
export function useSaveParameterValue(view: ParameterView) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; color?: string; id?: string; version?: number }) => {
      const { id, version, ...fields } = input;
      return id !== undefined && version !== undefined
        ? unwrap(
            await apiClient.PATCH(itemPath(view), {
              params: { path: itemParams(view, id) },
              body: { ...fields, version },
            }),
          )
        : unwrap(await apiClient.POST(listPath(view), { body: fields }));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['parameters', view.slug] }),
  });
}

/** Deactivates or reactivates a value; the list refreshes afterwards. */
export function useSetParameterValueActive(view: ParameterView) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) =>
      unwrap(
        await apiClient.POST(setActivePath(view, active), {
          params: { path: itemParams(view, id) },
        }),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['parameters', view.slug] }),
  });
}
