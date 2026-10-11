import { unwrap } from '@soltec/shared';
import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../access/SessionContext';

/** The widgets of the signed-in user's home screen, in the order they show. */
export function useDashboard() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => unwrap(await apiClient.GET('/v1/dashboard')),
  });
}
