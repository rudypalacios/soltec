import { unwrap, unwrapEmpty } from '@soltec/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from './SessionContext';

/** The devices where the signed-in user has a session open. */
export function useMyDevices() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['my-devices'],
    queryFn: async () => unwrap(await apiClient.GET('/v1/me/devices')),
  });
}

/** Closes the session of one of the user's own devices; the list refreshes afterwards. */
export function useRevokeDevice() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (deviceId: string) =>
      unwrapEmpty(
        await apiClient.DELETE('/v1/me/devices/{deviceId}', { params: { path: { deviceId } } }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-devices'] }),
  });
}
