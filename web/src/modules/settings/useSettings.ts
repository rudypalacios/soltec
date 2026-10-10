import { unwrap, type components } from '@soltec/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_PATH } from '../../app/apiPath';
import { readCachedBranding, writeCachedBranding } from '../../adapters/brandingCache';
import { useApiClient } from '../access/SessionContext';

type CompanyUpdate = components['schemas']['CompanyUpdate'];
type FinancialSettingsUpdate = components['schemas']['FinancialSettingsUpdate'];
type SequenceUpdate = components['schemas']['SequenceUpdate'];

/** The image of the company's logo. The version in the query string makes a new logo a new URL for the cache. */
export function brandingLogoUrl(version: string): string {
  return `${API_PATH}/v1/branding/logo?v=${encodeURIComponent(version)}`;
}

/**
 * The company's name and logo version: public, so it works on the sign-in screen too. The app asks for it as soon as
 * it starts (see `App`), in parallel with restoring the session, not after it.
 */
export function useBranding() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['branding'],
    queryFn: async () => {
      const branding = unwrap(await apiClient.GET('/v1/branding'));
      writeCachedBranding(branding);
      return branding;
    },
    // What this browser saw last time paints at once; `initialDataUpdatedAt: 0` marks it stale, so it is asked again.
    initialData: readCachedBranding,
    initialDataUpdatedAt: 0,
    staleTime: 5 * 60_000,
    // The brand is decoration: if it cannot be read the screens show the product's own mark.
    retry: false,
  });
}

export function useCompany(enabled = true) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['company'],
    queryFn: async () => unwrap(await apiClient.GET('/v1/settings/company')),
    enabled,
  });
}

/** Everything that shows the company (the settings screen and the brand) refreshes after a change. */
function useRefreshCompany() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: ['company'] });
    await queryClient.invalidateQueries({ queryKey: ['branding'] });
  };
}

export function useSaveCompany() {
  const apiClient = useApiClient();
  const refresh = useRefreshCompany();
  return useMutation({
    mutationFn: async (body: CompanyUpdate) =>
      unwrap(await apiClient.PATCH('/v1/settings/company', { body })),
    onSuccess: refresh,
  });
}

export function useUploadLogo() {
  const apiClient = useApiClient();
  const refresh = useRefreshCompany();
  return useMutation({
    mutationFn: async (file: File) =>
      unwrap(
        await apiClient.PUT('/v1/settings/company/logo', {
          // The contract types a binary body as a string; the file goes out as it is, with its own type.
          body: file as unknown as string,
          bodySerializer: (body) => body,
          headers: { 'Content-Type': file.type },
        }),
      ),
    onSuccess: refresh,
  });
}

export function useRemoveLogo() {
  const apiClient = useApiClient();
  const refresh = useRefreshCompany();
  return useMutation({
    mutationFn: async () => unwrap(await apiClient.DELETE('/v1/settings/company/logo')),
    onSuccess: refresh,
  });
}

export function useFinancialSettings(enabled = true) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['financial-settings'],
    queryFn: async () => unwrap(await apiClient.GET('/v1/settings/financial')),
    enabled,
  });
}

export function useSaveFinancialSettings() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: FinancialSettingsUpdate) =>
      unwrap(await apiClient.PATCH('/v1/settings/financial', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['financial-settings'] }),
  });
}

export function useSequences(enabled = true) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['sequences'],
    queryFn: async () => unwrap(await apiClient.GET('/v1/sequences')),
    enabled,
  });
}

export function useSaveSequence() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ code, body }: { code: string; body: SequenceUpdate }) =>
      unwrap(await apiClient.PATCH('/v1/sequences/{code}', { params: { path: { code } }, body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sequences'] }),
  });
}
