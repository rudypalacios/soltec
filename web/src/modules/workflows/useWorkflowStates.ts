import { unwrap } from '@soltec/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../access/SessionContext';
import type { WorkflowCode } from './workflowFlows';

const key = (workflow: WorkflowCode) => ['workflow-states', workflow] as const;

/** Every state of a flow, inactive ones included, in the order of the flow. */
export function useWorkflowStates(workflow: WorkflowCode) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: key(workflow),
    queryFn: async () =>
      unwrap(
        await apiClient.GET('/v1/workflows/{workflow}/states', {
          params: { path: { workflow }, query: { status: 'all' } },
        }),
      ).data,
  });
}

export interface StateInput {
  name: string;
  color: string;
  isTerminal: boolean;
  /** Edit only: true moves the initial flag to this state. */
  makeInitial?: boolean;
  /** Present when editing. */
  id?: string;
  version?: number;
}

/** Creates a state, or edits it when `id` and `version` are given. */
export function useSaveWorkflowState(workflow: WorkflowCode) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: StateInput) =>
      input.id !== undefined && input.version !== undefined
        ? unwrap(
            await apiClient.PATCH('/v1/workflows/{workflow}/states/{stateId}', {
              params: { path: { workflow, stateId: input.id } },
              body: {
                version: input.version,
                name: input.name,
                color: input.color,
                is_terminal: input.isTerminal,
                is_initial: input.makeInitial ?? false,
              },
            }),
          )
        : unwrap(
            await apiClient.POST('/v1/workflows/{workflow}/states', {
              params: { path: { workflow } },
              body: { name: input.name, color: input.color, is_terminal: input.isTerminal },
            }),
          ),
    // Moving the initial flag or a terminal one changes other states too, so the whole flow is read again.
    onSettled: () => queryClient.invalidateQueries({ queryKey: key(workflow) }),
  });
}

export function useSetWorkflowStateActive(workflow: WorkflowCode) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ stateId, active }: { stateId: string; active: boolean }) =>
      unwrap(
        await apiClient.POST(
          active
            ? '/v1/workflows/{workflow}/states/{stateId}/reactivate'
            : '/v1/workflows/{workflow}/states/{stateId}/deactivate',
          { params: { path: { workflow, stateId } } },
        ),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key(workflow) }),
  });
}

/** Puts the active states in the order given. */
export function useReorderWorkflowStates(workflow: WorkflowCode) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) =>
      unwrap(
        await apiClient.PUT('/v1/workflows/{workflow}/states/order', {
          params: { path: { workflow } },
          body: { ids },
        }),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key(workflow) }),
  });
}

/** Replaces the transitions of the whole flow. */
export function useSetWorkflowTransitions(workflow: WorkflowCode) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (transitions: { from_id: string; to_id: string }[]) =>
      unwrap(
        await apiClient.PUT('/v1/workflows/{workflow}/transitions', {
          params: { path: { workflow } },
          body: { transitions },
        }),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key(workflow) }),
  });
}
