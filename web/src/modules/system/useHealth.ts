import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../access/SessionContext';

/** Reads the API status; both the healthy and the degraded answers carry the same body. */
export function useHealth() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/v1/health');
      const health = data ?? error;
      if (!health) {
        throw new Error('The health endpoint returned an empty response.');
      }
      return health;
    },
    retry: false,
  });
}
