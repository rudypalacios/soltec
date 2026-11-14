import type { ColumnDraft, NameProblem } from '@soltec/shared';
import type { WorkflowState } from './workflowFlows';

/** What the two editors of the arrangement (drag and drop, and the list for a phone) receive from the dialog. */
export interface ColumnsEditorProps {
  drafts: readonly ColumnDraft[];
  /** For each column, what its name lacks. */
  problems: readonly (NameProblem | null)[];
  statesById: ReadonlyMap<string, WorkflowState>;
  disabled: boolean;
  onRename: (key: string, name: string) => void;
  onMoveColumn: (from: number, to: number) => void;
  /** `targetKey` is the key of a column, or `NEW_COLUMN`. */
  onMoveState: (stateId: string, targetKey: string) => void;
}
