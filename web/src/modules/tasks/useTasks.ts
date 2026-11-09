import { unwrap, type components, type paths } from '@soltec/shared';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useApiClient } from '../access/SessionContext';

type TaskQuery = NonNullable<paths['/v1/tasks']['get']['parameters']['query']>;
export type Task = components['schemas']['Task'];
export type TaskInput = components['schemas']['TaskInput'];
export type TaskTransition = components['schemas']['TaskTransition'];
export type ThreadEntry = components['schemas']['ThreadEntry'];

/** How often an open thread asks for news (ADR-0005). The tab pauses it while it is hidden. */
export const THREAD_REFRESH_MS = 30_000;

export function useTasks(query: TaskQuery) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['tasks', 'list', query],
    queryFn: async () => unwrap(await apiClient.GET('/v1/tasks', { params: { query } })),
    placeholderData: keepPreviousData,
  });
}

export function useTask(taskId: string | undefined) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['tasks', 'detail', taskId],
    queryFn: async () =>
      unwrap(
        await apiClient.GET('/v1/tasks/{taskId}', { params: { path: { taskId: taskId ?? '' } } }),
      ),
    enabled: taskId !== undefined,
    refetchInterval: THREAD_REFRESH_MS,
  });
}

/** The form works on a copy of the task, so it does not refetch in the background. */
export function useTaskForEdit(taskId: string | undefined) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['tasks', 'edit', taskId],
    queryFn: async () =>
      unwrap(
        await apiClient.GET('/v1/tasks/{taskId}', { params: { path: { taskId: taskId ?? '' } } }),
      ),
    enabled: taskId !== undefined,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
}

export function useCreateTask() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: TaskInput) => unwrap(await apiClient.POST('/v1/tasks', { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useUpdateTask(taskId: string) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: TaskInput & { version: number }) =>
      unwrap(await apiClient.PATCH('/v1/tasks/{taskId}', { params: { path: { taskId } }, body })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      await queryClient.invalidateQueries({ queryKey: ['thread', taskId] });
    },
  });
}

/** Moves a task to another state; the task and its thread (which gets the event) refresh afterwards. */
export function useTransitionTask(taskId: string) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: TaskTransition) =>
      unwrap(
        await apiClient.POST('/v1/tasks/{taskId}/transition', {
          params: { path: { taskId } },
          body,
        }),
      ),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      await queryClient.invalidateQueries({ queryKey: ['thread', taskId] });
    },
  });
}

/** Deactivates or reactivates a task; the lists refresh afterwards. */
export function useSetTaskActive() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, active }: { taskId: string; active: boolean }) =>
      unwrap(
        await apiClient.POST(
          active ? '/v1/tasks/{taskId}/reactivate' : '/v1/tasks/{taskId}/deactivate',
          { params: { path: { taskId } } },
        ),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

/** The people a task can be assigned to. */
export function useAssigneeOptions(text: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['tasks', 'assignee-options', text],
    queryFn: async () =>
      unwrap(
        await apiClient.GET('/v1/tasks/assignee-options', {
          params: { query: { q: text || undefined, limit: 20 } },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

/** The task types to choose from (any internal session may read them). */
export function useTaskTypeOptions() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['task-types', 'options'],
    queryFn: async () => unwrap(await apiClient.GET('/v1/task-types/options')),
    staleTime: 5 * 60_000,
  });
}

/** The thread of a task, newest first, a page at a time; it asks for news while it is open. */
export function useThread(taskId: string) {
  const apiClient = useApiClient();
  return useInfiniteQuery({
    queryKey: ['thread', taskId],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await apiClient.GET('/v1/tasks/{taskId}/thread', {
          params: { path: { taskId }, query: { cursor: pageParam, limit: 30 } },
        }),
      ),
    getNextPageParam: (last) => last.meta.next_cursor ?? undefined,
    refetchInterval: THREAD_REFRESH_MS,
  });
}

export interface CommentDraft {
  /** Chosen by the app and kept for retries, so one comment is never stored twice. */
  id: string;
  body: string;
  file_ids: string[];
}

export function useComment(taskId: string) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CommentDraft) =>
      unwrap(
        await apiClient.POST('/v1/tasks/{taskId}/thread', { params: { path: { taskId } }, body }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['thread', taskId] }),
  });
}

export function useEditComment(taskId: string) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ entryId, ...body }: { entryId: string; version: number; body: string }) =>
      unwrap(
        await apiClient.PATCH('/v1/thread-entries/{entryId}', {
          params: { path: { entryId } },
          body,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['thread', taskId] }),
  });
}

export function useDeactivateComment(taskId: string) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entryId: string) =>
      unwrap(
        await apiClient.POST('/v1/thread-entries/{entryId}/deactivate', {
          params: { path: { entryId } },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['thread', taskId] }),
  });
}

/** The people a comment on the task can mention, filtered by what is typed after the `@`. */
export function useMentionOptions(taskId: string, text: string, enabled: boolean) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['tasks', taskId, 'mention-options', text],
    queryFn: async () =>
      unwrap(
        await apiClient.GET('/v1/tasks/{taskId}/mention-options', {
          params: { path: { taskId }, query: { q: text || undefined, limit: 8 } },
        }),
      ),
    placeholderData: keepPreviousData,
    enabled,
  });
}
