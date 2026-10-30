import type { components } from '@soltec/shared';

export type WorkflowCode = components['schemas']['WorkflowCode'];
export type WorkflowState = components['schemas']['WorkflowState'];

/** The flows the screen administers, with how each reads in Spanish. A new flow adds a line here. */
export const WORKFLOW_FLOWS = [
  { code: 'task', label: 'Tareas', noun: 'tareas' },
  { code: 'ticket', label: 'Tickets', noun: 'tickets' },
] as const satisfies readonly { code: WorkflowCode; label: string; noun: string }[];

/** Every active state's outgoing links as pairs, replacing the ones of `stateId` with `destinations`. */
export function transitionPairs(
  states: readonly WorkflowState[],
  stateId: string,
  destinations: readonly string[],
): { from_id: string; to_id: string }[] {
  const pairs: { from_id: string; to_id: string }[] = [];
  for (const state of states) {
    if (!state.is_active) {
      continue;
    }
    const targets = state.id === stateId ? destinations : state.transitions_to;
    for (const target of targets) {
      pairs.push({ from_id: state.id, to_id: target });
    }
  }
  return pairs;
}
