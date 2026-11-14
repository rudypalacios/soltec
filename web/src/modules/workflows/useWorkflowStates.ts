import { unwrap, type components } from '@soltec/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useApiClient } from '../access/SessionContext';
import type { WorkflowCode } from './workflowFlows';

const key = (workflow: WorkflowCode) => ['workflow-states', workflow] as const;
const columnsKey = (workflow: WorkflowCode) => ['board-columns', workflow] as const;

export type BoardColumn = components['schemas']['BoardColumn'];

/**
 * A change to a flow can move a state to another column or start a new one, so the columns and the board of tasks
 * (which groups by them) are read again together with the states.
 */
const refreshFlow = async (queryClient: QueryClient, workflow: WorkflowCode) => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: key(workflow) }),
    queryClient.invalidateQueries({ queryKey: columnsKey(workflow) }),
    queryClient.invalidateQueries({ queryKey: ['tasks', 'board'] }),
  ]);
};

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

/** The columns of the board of a flow, in order, each with its active states. */
export function useBoardColumns(workflow: WorkflowCode) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: columnsKey(workflow),
    queryFn: async () =>
      unwrap(
        await apiClient.GET('/v1/workflows/{workflow}/board-columns', {
          params: { path: { workflow } },
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
  /** Create only: the column to put the state in; without it the state starts a column of its own. */
  boardColumnId?: string;
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
              body: {
                name: input.name,
                color: input.color,
                is_terminal: input.isTerminal,
                ...(input.boardColumnId ? { board_column_id: input.boardColumnId } : {}),
              },
            }),
          ),
    // Moving the initial flag or a terminal one changes other states too, so the whole flow is read again.
    onSettled: () => refreshFlow(queryClient, workflow),
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
    onSettled: () => refreshFlow(queryClient, workflow),
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
    onSettled: () => refreshFlow(queryClient, workflow),
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
    onSettled: () => refreshFlow(queryClient, workflow),
  });
}

export interface BoardColumnInput {
  /** An existing column to keep; null creates one. */
  id: string | null;
  name: string;
  stateIds: string[];
}

/** Replaces the arrangement of the board: the columns in order, each with the active states it groups. */
export function useReplaceBoardColumns(workflow: WorkflowCode) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (columns: BoardColumnInput[]) =>
      unwrap(
        await apiClient.PUT('/v1/workflows/{workflow}/board-columns', {
          params: { path: { workflow } },
          body: {
            columns: columns.map((column) => ({
              id: column.id,
              name: column.name,
              state_ids: column.stateIds,
            })),
          },
        }),
      ).data,
    onSettled: () => refreshFlow(queryClient, workflow),
  });
}
