import { isRequirementsReport } from '@soltec/shared';
import { useQuery } from '@tanstack/react-query';

/** Reads the server requirements report. The route is not in the contract, so it is fetched directly. */
export function useRequirements() {
  return useQuery({
    queryKey: ['requirements'],
    queryFn: async () => {
      const response = await fetch(`${window.location.origin}/api/system/requirements`);
      if (!response.ok) {
        throw new Error(`The requirements endpoint answered HTTP ${response.status}.`);
      }
      const report: unknown = await response.json();
      if (!isRequirementsReport(report)) {
        throw new Error('The requirements endpoint returned an unexpected response.');
      }
      return report;
    },
    retry: false,
  });
}
