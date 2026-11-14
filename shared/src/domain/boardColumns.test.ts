import { describe, expect, it } from 'vitest';
import {
  isChanged,
  moveColumn,
  moveState,
  nameProblems,
  NEW_COLUMN,
  renameColumn,
  type ColumnDraft,
} from './boardColumns';

const column = (key: string, name: string, stateIds: string[]): ColumnDraft => ({
  key,
  id: key,
  name,
  stateIds,
});
const ORDER = new Map([
  ['a', 0],
  ['b', 1],
  ['c', 2],
  ['d', 3],
]);
const BOARD = [
  column('1', 'Por hacer', ['a']),
  column('2', 'En curso', ['b', 'c']),
  column('3', 'Cerrada', ['d']),
];

describe('moveState', () => {
  it('joins a state to another column, in the order of the flow', () => {
    const next = moveState(BOARD, { id: 'a', name: 'Asignada' }, '2', ORDER, 'new-0');

    expect(next.map((c) => [c.name, c.stateIds])).toEqual([
      ['En curso', ['a', 'b', 'c']],
      ['Cerrada', ['d']],
    ]);
  });

  it('closes the column it leaves when it was the last state', () => {
    const next = moveState(BOARD, { id: 'd', name: 'Cerrada' }, '1', ORDER, 'new-0');

    expect(next.map((c) => c.name)).toEqual(['Por hacer', 'En curso']);
  });

  it('starts a column of its own at the end, named like the state, with no id yet', () => {
    const next = moveState(BOARD, { id: 'c', name: 'En ejecución' }, NEW_COLUMN, ORDER, 'new-7');

    expect(next.map((c) => c.name)).toEqual(['Por hacer', 'En curso', 'Cerrada', 'En ejecución']);
    expect(next[3]).toEqual({ key: 'new-7', id: null, name: 'En ejecución', stateIds: ['c'] });
    expect(next[1]?.stateIds).toEqual(['b']);
  });

  it('does not start a second column for a state that is alone in its own', () => {
    expect(moveState(BOARD, { id: 'a', name: 'Asignada' }, NEW_COLUMN, ORDER, 'n')).toBe(BOARD);
  });

  it('leaves everything as it is for its own column or an unknown one', () => {
    expect(moveState(BOARD, { id: 'b', name: 'B' }, '2', ORDER, 'n')).toBe(BOARD);
    expect(moveState(BOARD, { id: 'b', name: 'B' }, 'nope', ORDER, 'n')).toBe(BOARD);
    expect(moveState(BOARD, { id: 'zzz', name: 'Z' }, '1', ORDER, 'n')).toBe(BOARD);
  });

  it('does not touch the arrangement it was given', () => {
    const before = JSON.stringify(BOARD);
    moveState(BOARD, { id: 'a', name: 'Asignada' }, '2', ORDER, 'n');

    expect(JSON.stringify(BOARD)).toBe(before);
  });
});

describe('moveColumn', () => {
  it('moves a column to a position', () => {
    expect(moveColumn(BOARD, 0, 2).map((c) => c.name)).toEqual([
      'En curso',
      'Cerrada',
      'Por hacer',
    ]);
    expect(moveColumn(BOARD, 2, 0).map((c) => c.name)).toEqual([
      'Cerrada',
      'Por hacer',
      'En curso',
    ]);
  });

  it('ignores positions that do not exist or do not change anything', () => {
    expect(moveColumn(BOARD, 1, 1)).toBe(BOARD);
    expect(moveColumn(BOARD, -1, 1)).toBe(BOARD);
    expect(moveColumn(BOARD, 0, 3)).toBe(BOARD);
    expect(moveColumn(BOARD, 0.5, 1)).toBe(BOARD);
  });
});

describe('names and changes', () => {
  it('flags an empty name and a name an earlier column already has, case aside', () => {
    const renamed = renameColumn(renameColumn(BOARD, '2', '  '), '3', ' por HACER ');

    expect(nameProblems(renamed)).toEqual([null, 'empty', 'duplicate']);
    expect(nameProblems(BOARD)).toEqual([null, null, null]);
  });

  it('tells whether the arrangement differs from the original', () => {
    expect(isChanged(BOARD, BOARD)).toBe(false);
    expect(isChanged(BOARD, renameColumn(BOARD, '1', 'Pendiente'))).toBe(true);
    expect(isChanged(BOARD, renameColumn(BOARD, '1', 'Por hacer '))).toBe(false);
    expect(isChanged(BOARD, moveColumn(BOARD, 0, 1))).toBe(true);
    expect(isChanged(BOARD, moveState(BOARD, { id: 'a', name: 'A' }, '2', ORDER, 'n'))).toBe(true);
  });
});
