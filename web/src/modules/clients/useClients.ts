import { unwrap, type components, type paths } from '@soltec/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../access/SessionContext';

type ClientQuery = NonNullable<paths['/v1/clients']['get']['parameters']['query']>;
export type ClientCreate = components['schemas']['ClientCreate'];
export type ClientUpdate = components['schemas']['ClientUpdate'];
export type ClientConvert = components['schemas']['ClientConvert'];
export type Reassignment = components['schemas']['Reassignment'];

/** Every client request starts from here: what changed is refetched, whatever screen shows it. */
function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['clients'] });
}

export function useClients(query: ClientQuery) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['clients', 'list', query],
    queryFn: async () => unwrap(await apiClient.GET('/v1/clients', { params: { query } })),
    placeholderData: keepPreviousData,
  });
}

export function useClient(clientId: string | undefined) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['clients', 'detail', clientId],
    queryFn: async () =>
      unwrap(
        await apiClient.GET('/v1/clients/{clientId}', {
          params: { path: { clientId: clientId ?? '' } },
        }),
      ),
    enabled: clientId !== undefined,
    // The edit form works on a copy: refetching in the background would silently replace what is being typed.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
}

/** Clients within the person's reach whose name resembles what is being typed (three letters or more). */
export function useSimilarClients(name: string, enabled: boolean) {
  const apiClient = useApiClient();
  const text = name.trim();
  return useQuery({
    queryKey: ['clients', 'similar', text],
    queryFn: async () =>
      unwrap(await apiClient.GET('/v1/clients/similar', { params: { query: { name: text } } })),
    enabled: enabled && text.length >= 3,
    placeholderData: keepPreviousData,
  });
}

export function useCreateClient() {
  const apiClient = useApiClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (body: ClientCreate) => unwrap(await apiClient.POST('/v1/clients', { body })),
    onSuccess: refresh,
  });
}

export function useUpdateClient(clientId: string) {
  const apiClient = useApiClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (body: ClientUpdate) =>
      unwrap(
        await apiClient.PATCH('/v1/clients/{clientId}', { params: { path: { clientId } }, body }),
      ),
    onSuccess: refresh,
  });
}

export function useConvertClient(clientId: string) {
  const apiClient = useApiClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (body: ClientConvert) =>
      unwrap(
        await apiClient.POST('/v1/clients/{clientId}/convert', {
          params: { path: { clientId } },
          body,
        }),
      ),
    onSuccess: refresh,
  });
}

/** Deactivates or reactivates a client; the screens refresh afterwards. */
export function useSetClientActive() {
  const apiClient = useApiClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async ({ clientId, active }: { clientId: string; active: boolean }) =>
      unwrap(
        await apiClient.POST(
          active ? '/v1/clients/{clientId}/reactivate' : '/v1/clients/{clientId}/deactivate',
          { params: { path: { clientId } } },
        ),
      ),
    onSettled: refresh,
  });
}

export function useAddSeller(clientId: string) {
  const apiClient = useApiClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (userId: string) =>
      unwrap(
        await apiClient.POST('/v1/clients/{clientId}/sellers', {
          params: { path: { clientId } },
          body: { user_id: userId },
        }),
      ),
    onSuccess: refresh,
  });
}

export function useRemoveSeller(clientId: string) {
  const apiClient = useApiClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (userId: string) =>
      unwrap(
        await apiClient.DELETE('/v1/clients/{clientId}/sellers/{userId}', {
          params: { path: { clientId, userId } },
        }),
      ),
    onSuccess: refresh,
  });
}

export function useSetResponsible(clientId: string) {
  const apiClient = useApiClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (userId: string) =>
      unwrap(
        await apiClient.POST('/v1/clients/{clientId}/responsible', {
          params: { path: { clientId } },
          body: { user_id: userId },
        }),
      ),
    onSuccess: refresh,
  });
}

export function useReassignClient(clientId: string) {
  const apiClient = useApiClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (body: Reassignment) =>
      unwrap(
        await apiClient.POST('/v1/clients/{clientId}/reassign', {
          params: { path: { clientId } },
          body,
        }),
      ),
    onSuccess: refresh,
  });
}

export function useReassignPortfolio() {
  const apiClient = useApiClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (body: Reassignment) =>
      unwrap(await apiClient.POST('/v1/clients/reassign', { body })),
    onSuccess: refresh,
  });
}

export function useSetContactRoles(clientId: string) {
  const apiClient = useApiClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async ({
      contactId,
      contactTypeIds,
    }: {
      contactId: string;
      contactTypeIds: string[];
    }) =>
      unwrap(
        await apiClient.PUT('/v1/clients/{clientId}/contacts/{contactId}', {
          params: { path: { clientId, contactId } },
          body: { contact_type_ids: contactTypeIds },
        }),
      ),
    onSuccess: refresh,
  });
}

export function useUnlinkContact(clientId: string) {
  const apiClient = useApiClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (contactId: string) =>
      unwrap(
        await apiClient.DELETE('/v1/clients/{clientId}/contacts/{contactId}', {
          params: { path: { clientId, contactId } },
        }),
      ),
    onSuccess: refresh,
  });
}

/** The people that can be made advisers, searched on the server by name or email. */
export function usePersonOptions(text: string, enabled = true) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['clients', 'seller-options', text],
    queryFn: async () =>
      unwrap(
        await apiClient.GET('/v1/clients/seller-options', {
          params: { query: { q: text || undefined, limit: 50 } },
        }),
      ),
    enabled,
  });
}

/** The active client statuses with their color, for the selector and the filter. */
export function useClientStatusOptions() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['clients', 'options', 'client-statuses'],
    queryFn: async () => unwrap(await apiClient.GET('/v1/client-statuses/options')),
  });
}

export function useSegmentOptions() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['clients', 'options', 'segments'],
    queryFn: async () => unwrap(await apiClient.GET('/v1/segments/options')),
  });
}

export function useTaxRegimeOptions(enabled = true) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['clients', 'options', 'tax-regimes'],
    queryFn: async () => unwrap(await apiClient.GET('/v1/tax-regimes/options')),
    enabled,
  });
}

export function usePaymentMethodOptions(enabled = true) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['clients', 'options', 'payment-methods'],
    queryFn: async () => unwrap(await apiClient.GET('/v1/payment-methods/options')),
    enabled,
  });
}

export function useContactTypeOptions(enabled = true) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['clients', 'options', 'contact-types'],
    queryFn: async () => unwrap(await apiClient.GET('/v1/contact-types/options')),
    enabled,
  });
}
