/**
 * The arrangement of the board of a flow while someone edits it: columns in order, each with the states it groups.
 * Every function returns a new arrangement and leaves its argument alone, so the screen can keep the original to know
 * whether anything changed. The rules live here and not in the components so the drag and drop of a desktop and the
 * selectors of a phone cannot disagree.
 */

/** A column being arranged. `key` identifies it before it has an `id`; `id` is null until it is saved. */
export interface ColumnDraft {
  key: string;
  id: string | null;
  name: string;
  stateIds: readonly string[];
}

/** The target that means «a column of its own» for a state. */
export const NEW_COLUMN = '__new__';

/** What a column name lacks, or null when it is fine. */
export type NameProblem = 'empty' | 'duplicate';

const normalized = (name: string) => name.trim().toLowerCase();

/**
 * Puts a state in another column. A state dropped on `NEW_COLUMN` starts a column at the end, named like the state
 * (`newKey` is the key of that column, chosen by the caller so it stays stable between renders). States inside a
 * column keep the order of the flow (`order`: the position of each state), wherever they are dropped. A state that is
 * alone in its column stays where it is when dropped on `NEW_COLUMN`. A column left
 * without states disappears. Moving a state to the column it is in changes nothing.
 */
export function moveState(
  columns: readonly ColumnDraft[],
  state: { id: string; name: string },
  targetKey: string,
  order: ReadonlyMap<string, number>,
  newKey: string,
): readonly ColumnDraft[] {
  const origin = columns.find((column) => column.stateIds.includes(state.id));
  if (origin === undefined || origin.key === targetKey) {
    return columns;
  }
  // A state that is alone in its column already has one of its own: a new column would only swap the two.
  if (targetKey === NEW_COLUMN && origin.stateIds.length === 1) {
    return columns;
  }
  if (targetKey !== NEW_COLUMN && !columns.some((column) => column.key === targetKey)) {
    return columns;
  }
  const without = columns.map((column) =>
    column.key === origin.key
      ? { ...column, stateIds: column.stateIds.filter((id) => id !== state.id) }
      : column,
  );
  const next =
    targetKey === NEW_COLUMN
      ? [...without, { key: newKey, id: null, name: state.name, stateIds: [state.id] }]
      : without.map((column) =>
          column.key === targetKey
            ? {
                ...column,
                stateIds: [...column.stateIds, state.id].sort(
                  (a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0),
                ),
              }
            : column,
        );
  return next.filter((column) => column.stateIds.length > 0);
}

/** Moves the column at `from` to position `to`. Out-of-range positions leave the arrangement as it is. */
export function moveColumn(
  columns: readonly ColumnDraft[],
  from: number,
  to: number,
): readonly ColumnDraft[] {
  const inRange = (index: number) =>
    Number.isInteger(index) && index >= 0 && index < columns.length;
  if (from === to || !inRange(from) || !inRange(to)) {
    return columns;
  }
  const next = [...columns];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) {
    return columns;
  }
  next.splice(to, 0, moved);
  return next;
}

/** Renames a column; the rest stays. */
export function renameColumn(
  columns: readonly ColumnDraft[],
  key: string,
  name: string,
): readonly ColumnDraft[] {
  return columns.map((column) => (column.key === key ? { ...column, name } : column));
}

/** For each column, what its name lacks: empty, or the same (case aside) as an earlier column's. */
export function nameProblems(columns: readonly ColumnDraft[]): (NameProblem | null)[] {
  const names = columns.map((column) => normalized(column.name));
  return columns.map((column, index) => {
    if (column.name.trim() === '') {
      return 'empty';
    }
    return names.indexOf(normalized(column.name)) !== index ? 'duplicate' : null;
  });
}

/** Whether two arrangements differ in a column, its name, its states or the order of the columns. */
export function isChanged(a: readonly ColumnDraft[], b: readonly ColumnDraft[]): boolean {
  const summary = (list: readonly ColumnDraft[]) =>
    JSON.stringify(list.map((column) => [column.id, column.name.trim(), column.stateIds]));
  return summary(a) !== summary(b);
}
