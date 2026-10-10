import { unwrapEmpty } from '@soltec/shared';
import { useMutation } from '@tanstack/react-query';
import { useApiClient } from './SessionContext';

/** The calls behind the links of the emails. None of them needs a session. */
export function useAcceptInvitation() {
  const apiClient = useApiClient();
  return useMutation({
    mutationFn: async (body: { token: string; password: string }) =>
      unwrapEmpty(await apiClient.POST('/v1/auth/invitations/accept', { body })),
  });
}

export function useForgotPassword() {
  const apiClient = useApiClient();
  return useMutation({
    mutationFn: async (body: { email: string }) =>
      unwrapEmpty(await apiClient.POST('/v1/auth/password/forgot', { body })),
  });
}

export function useResetPassword() {
  const apiClient = useApiClient();
  return useMutation({
    mutationFn: async (body: { token: string; password: string }) =>
      unwrapEmpty(await apiClient.POST('/v1/auth/password/reset', { body })),
  });
}
