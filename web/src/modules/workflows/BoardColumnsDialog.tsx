import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import {
  isChanged,
  moveColumn,
  moveState,
  nameProblems,
  renameColumn,
  type ColumnDraft,
} from '@soltec/shared';
import { useState, type FormEvent } from 'react';
import { useIsMobile } from '../../components/useIsMobile';
import { fieldMessages, problemMessage } from '../access/messages';
import { ColumnLanes } from './ColumnLanes';
import { ColumnList } from './ColumnList';
import { useReplaceBoardColumns, type BoardColumn } from './useWorkflowStates';
import type { WorkflowCode, WorkflowState } from './workflowFlows';

/**
 * «Configurar tablero»: arranges the columns of the board of a flow, which states each one groups, its name and the
 * order of the columns. A desktop drags lanes and states; a phone picks the column of each state from a list. Nothing
 * is saved until «Guardar», so moving things around and back is free. Every state is in a column: a state dropped
 * on «Nueva columna» starts one, and a column left with no state disappears.
 */
export function BoardColumnsDialog({
  workflow,
  states,
  columns,
  onClose,
}: {
  workflow: WorkflowCode;
  states: readonly WorkflowState[];
  columns: readonly BoardColumn[];
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const save = useReplaceBoardColumns(workflow);
  const active = states.filter((state) => state.is_active);
  const order = new Map(active.map((state, index) => [state.id, index]));
  const statesById = new Map(active.map((state) => [state.id, state]));
  // Columns without an active state have nothing to arrange; the server keeps them for their inactive states.
  const initial: readonly ColumnDraft[] = columns
    .filter((column) => column.state_ids.length > 0)
    .map((column) => ({
      key: column.id,
      id: column.id,
      name: column.name,
      stateIds: column.state_ids,
    }));
  const [original] = useState(initial);
  const [drafts, setDrafts] = useState<readonly ColumnDraft[]>(initial);
  const [created, setCreated] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  // A desktop can also use the list a phone uses: it needs no pointer, which is what the keyboard and a screen reader want.
  const [asList, setAsList] = useState(false);
  const showList = isMobile || asList;

  const problems = nameProblems(drafts);
  const changed = isChanged(drafts, original);
  const valid = problems.every((problem) => problem === null);

  const onMoveState = (stateId: string, targetKey: string) => {
    const state = statesById.get(stateId);
    if (!state) {
      return;
    }
    const next = moveState(drafts, state, targetKey, order, `new-${created}`);
    if (next !== drafts) {
      setCreated(created + 1);
      setDrafts(next);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    try {
      await save.mutateAsync(
        drafts.map((draft) => ({
          id: draft.id,
          name: draft.name.trim(),
          stateIds: [...draft.stateIds],
        })),
      );
      onClose();
    } catch (error) {
      const fields = fieldMessages(error, {
        state_ids: {
          invalid:
            'Los estados del flujo cambiaron mientras editabas. Cierra esta ventana y vuelve a abrirla.',
        },
        columns: {
          invalid: 'Hay un nombre repetido o una columna que ya no existe. Revisa los nombres.',
        },
      });
      setFailure(fields.state_ids ?? fields.columns ?? problemMessage(error));
    }
  };

  const editorProps = {
    drafts,
    problems,
    statesById,
    disabled: save.isPending,
    onRename: (key: string, name: string) => setDrafts(renameColumn(drafts, key, name)),
    onMoveColumn: (from: number, to: number) => setDrafts(moveColumn(drafts, from, to)),
    onMoveState,
  };

  return (
    <Dialog
      open
      onClose={save.isPending ? undefined : onClose}
      fullWidth
      fullScreen={isMobile}
      maxWidth={isMobile ? 'sm' : 'lg'}
      aria-labelledby="board-columns-title"
    >
      <form
        onSubmit={(event) => void submit(event)}
        noValidate
        style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}
      >
        <DialogTitle id="board-columns-title">Configurar tablero</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {failure ? <Alert severity="error">{failure}</Alert> : null}
            <Typography variant="body2" color="text.secondary">
              {showList
                ? 'Cada estado está en una columna del tablero. Junta estados eligiendo la misma columna; una columna que se queda sin estados desaparece.'
                : 'Arrastra una columna por su asa para ordenarla. Arrastra un estado a otra columna para juntarlos, o a «Nueva columna» para separarlo. Para usar solo el teclado, cambia a la lista.'}
            </Typography>
            {isMobile ? null : (
              <Button
                size="small"
                color="inherit"
                onClick={() => setAsList(!asList)}
                sx={{ alignSelf: 'flex-start', minHeight: 44, textDecoration: 'underline' }}
              >
                {asList ? 'Volver al arrastre' : 'Usar la lista (sin arrastrar)'}
              </Button>
            )}
            {showList ? <ColumnList {...editorProps} /> : <ColumnLanes {...editorProps} />}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" color="inherit" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" variant="contained" disabled={save.isPending || !changed || !valid}>
            Guardar
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
