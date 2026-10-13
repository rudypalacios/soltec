import { unwrap, type components, type paths } from '@soltec/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../access/SessionContext';

type ContactQuery = NonNullable<paths['/v1/contacts']['get']['parameters']['query']>;
export type ContactCreate = components['schemas']['ContactCreate'];
export type ContactUpdate = components['schemas']['ContactUpdate'];

export function useContacts(query: ContactQuery) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['contacts', 'list', query],
    queryFn: async () => unwrap(await apiClient.GET('/v1/contacts', { params: { query } })),
    placeholderData: keepPreviousData,
  });
}

export function useContact(contactId: string | undefined) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['contacts', 'detail', contactId],
    queryFn: async () =>
      unwrap(
        await apiClient.GET('/v1/contacts/{contactId}', {
          params: { path: { contactId: contactId ?? '' } },
        }),
      ),
    enabled: contactId !== undefined,
    // The form works on a copy: refetching in the background would silently replace what the person is typing.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
}

export function useCreateContact() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: ContactCreate) =>
      unwrap(await apiClient.POST('/v1/contacts', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contacts'] }),
  });
}

export function useUpdateContact(contactId: string) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: ContactUpdate) =>
      unwrap(
        await apiClient.PATCH('/v1/contacts/{contactId}', {
          params: { path: { contactId } },
          body,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contacts'] }),
  });
}

/** Deactivates or reactivates a contact; the list refreshes afterwards. */
export function useSetContactActive() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ contactId, active }: { contactId: string; active: boolean }) =>
      unwrap(
        await apiClient.POST(
          active ? '/v1/contacts/{contactId}/reactivate' : '/v1/contacts/{contactId}/deactivate',
          { params: { path: { contactId } } },
        ),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['contacts'] }),
  });
}

/** The people the signed-in user can hand a contact to, as the API computes them from their data scope. */
export function useContactOwnerOptions(text: string, enabled = true) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['contacts', 'owner-options', text],
    queryFn: async () =>
      unwrap(
        await apiClient.GET('/v1/contacts/owner-options', {
          params: { query: { q: text || undefined, limit: 20 } },
        }),
      ),
    placeholderData: keepPreviousData,
    enabled,
  });
}
