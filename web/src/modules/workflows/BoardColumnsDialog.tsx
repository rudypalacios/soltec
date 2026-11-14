import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState, type FormEvent } from 'react';
import { fieldMessages, problemMessage } from '../access/messages';
import { ColoredName } from './ColoredName';
import { useReplaceBoardColumns, type BoardColumn } from './useWorkflowStates';
import type { WorkflowCode, WorkflowState } from './workflowFlows';

/** A column while it is being arranged. `key` identifies it before it has an id; `id` is null until it is saved. */
interface Draft {
  key: string;
  id: string | null;
  name: string;
  stateIds: string[];
}

const NEW_COLUMN = '__new__';
const normalized = (name: string) => name.trim().toLowerCase();

/**
 * Arranges the columns of the board of a flow: which states each column groups, its name and the order of the
 * columns. Nothing is saved until «Guardar», so moving things around and back is free. Every state is in a column:
 * moving it to «Una columna nueva» starts one, and a column left with no state disappears.
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
  const save = useReplaceBoardColumns(workflow);
  const active = states.filter((state) => state.is_active);
  const position = new Map(active.map((state, index) => [state.id, index]));
  const byId = new Map(active.map((state) => [state.id, state]));
  // Columns without an active state have nothing to arrange; the server keeps them for their inactive states.
  const initial: Draft[] = columns
    .filter((column) => column.state_ids.length > 0)
    .map((column) => ({
      key: column.id,
      id: column.id,
      name: column.name,
      stateIds: [...column.state_ids],
    }));
  const [drafts, setDrafts] = useState<Draft[]>(initial);
  const [created, setCreated] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);

  const summary = (list: readonly Draft[]) =>
    JSON.stringify(list.map((draft) => [draft.id, draft.name.trim(), draft.stateIds]));
  const changed = summary(drafts) !== summary(initial);
  const names = drafts.map((draft) => normalized(draft.name));
  const problemOf = (draft: Draft, index: number): string | null => {
    if (draft.name.trim() === '') {
      return 'Escribe un nombre.';
    }
    return names.indexOf(normalized(draft.name)) !== index
      ? 'Otra columna ya tiene ese nombre.'
      : null;
  };
  const valid = drafts.every((draft, index) => problemOf(draft, index) === null);

  const rename = (key: string, name: string) =>
    setDrafts(drafts.map((draft) => (draft.key === key ? { ...draft, name } : draft)));

  const moveColumn = (index: number, by: -1 | 1) => {
    const next = [...drafts];
    const [item] = next.splice(index, 1);
    if (item === undefined) {
      return;
    }
    next.splice(index + by, 0, item);
    setDrafts(next);
  };

  const moveState = (state: WorkflowState, targetKey: string) => {
    const origin = drafts.find((draft) => draft.stateIds.includes(state.id));
    if (origin === undefined || origin.key === targetKey) {
      return;
    }
    const withoutState = drafts.map((draft) =>
      draft.key === origin.key
        ? { ...draft, stateIds: draft.stateIds.filter((id) => id !== state.id) }
        : draft,
    );
    let next: Draft[];
    if (targetKey === NEW_COLUMN) {
      next = [
        ...withoutState,
        { key: `new-${created}`, id: null, name: state.name, stateIds: [state.id] },
      ];
      setCreated(created + 1);
    } else {
      next = withoutState.map((draft) =>
        draft.key === targetKey
          ? {
              ...draft,
              stateIds: [...draft.stateIds, state.id].sort(
                (a, b) => (position.get(a) ?? 0) - (position.get(b) ?? 0),
              ),
            }
          : draft,
      );
    }
    // The column the state left disappears when it is empty.
    setDrafts(next.filter((draft) => draft.stateIds.length > 0));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    try {
      await save.mutateAsync(
        drafts.map((draft) => ({
          id: draft.id,
          name: draft.name.trim(),
          stateIds: draft.stateIds,
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

  return (
    <Dialog
      open
      onClose={save.isPending ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="board-columns-title"
    >
      <form onSubmit={(event) => void submit(event)} noValidate>
        <DialogTitle id="board-columns-title">Columnas del tablero</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {failure ? <Alert severity="error">{failure}</Alert> : null}
            <Typography variant="body2" color="text.secondary">
              Cada estado está en una columna del tablero. Junta estados moviéndolos a la misma
              columna; una columna que se queda sin estados desaparece.
            </Typography>
            <Stack
              component="ul"
              spacing={2}
              aria-label="Columnas"
              sx={{ listStyle: 'none', m: 0, p: 0 }}
            >
              {drafts.map((draft, index) => {
                const problem = problemOf(draft, index);
                return (
                  <Paper key={draft.key} component="li" variant="outlined" sx={{ p: 1.5 }}>
                    <Stack spacing={1.5}>
                      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'flex-start' }}>
                        <TextField
                          label="Nombre de la columna"
                          value={draft.name}
                          onChange={(event) => rename(draft.key, event.target.value)}
                          error={problem !== null}
                          helperText={problem}
                          slotProps={{ htmlInput: { maxLength: 100 } }}
                          fullWidth
                        />
                        <IconButton
                          aria-label={`Subir la columna «${draft.name}»`}
                          disabled={index === 0 || save.isPending}
                          onClick={() => moveColumn(index, -1)}
                          sx={{ mt: 0.5 }}
                        >
                          <ArrowUpwardIcon />
                        </IconButton>
                        <IconButton
                          aria-label={`Bajar la columna «${draft.name}»`}
                          disabled={index === drafts.length - 1 || save.isPending}
                          onClick={() => moveColumn(index, 1)}
                          sx={{ mt: 0.5 }}
                        >
                          <ArrowDownwardIcon />
                        </IconButton>
                      </Stack>
                      <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
                        {draft.stateIds.map((stateId) => {
                          const state = byId.get(stateId);
                          return state ? (
                            <Box
                              component="li"
                              key={stateId}
                              sx={{
                                display: 'flex',
                                flexDirection: { xs: 'column', sm: 'row' },
                                gap: 1,
                                alignItems: { sm: 'center' },
                                justifyContent: 'space-between',
                              }}
                            >
                              <Box sx={{ overflowWrap: 'anywhere' }}>
                                <ColoredName state={state} />
                              </Box>
                              <TextField
                                select
                                size="small"
                                label={`Columna de «${state.name}»`}
                                value={draft.key}
                                onChange={(event) => moveState(state, event.target.value)}
                                disabled={save.isPending}
                                sx={{ minWidth: { sm: 220 } }}
                              >
                                {drafts.map((option) => (
                                  <MenuItem key={option.key} value={option.key}>
                                    {option.name.trim() || 'Sin nombre'}
                                  </MenuItem>
                                ))}
                                <MenuItem value={NEW_COLUMN}>Una columna nueva</MenuItem>
                              </TextField>
                            </Box>
                          ) : null;
                        })}
                      </Stack>
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
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
