import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import { Box, IconButton, MenuItem, Paper, Stack, TextField } from '@mui/material';
import { NEW_COLUMN, type ColumnDraft, type NameProblem } from '@soltec/shared';
import { ColoredName } from './ColoredName';
import type { ColumnsEditorProps } from './columnsEditor';

const PROBLEM_TEXT: Record<NameProblem, string> = {
  empty: 'Escribe un nombre.',
  duplicate: 'Otra columna ya tiene ese nombre.',
};

/**
 * The columns as a list: a name, arrows to move the column and a selector for the column of each state. It is the
 * editor of a phone, where dragging inside a dialog that scrolls goes wrong too often with a finger.
 */
export function ColumnList({
  drafts,
  problems,
  statesById,
  disabled,
  onRename,
  onMoveColumn,
  onMoveState,
}: ColumnsEditorProps) {
  return (
    <Stack component="ul" spacing={2} aria-label="Columnas" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {drafts.map((draft, index) => (
        <ColumnCard
          key={draft.key}
          draft={draft}
          index={index}
          count={drafts.length}
          drafts={drafts}
          problem={problems[index] ?? null}
          statesById={statesById}
          disabled={disabled}
          onRename={onRename}
          onMoveColumn={onMoveColumn}
          onMoveState={onMoveState}
        />
      ))}
    </Stack>
  );
}

function ColumnCard({
  draft,
  index,
  count,
  drafts,
  problem,
  statesById,
  disabled,
  onRename,
  onMoveColumn,
  onMoveState,
}: Pick<
  ColumnsEditorProps,
  'statesById' | 'disabled' | 'onRename' | 'onMoveColumn' | 'onMoveState'
> & {
  draft: ColumnDraft;
  index: number;
  count: number;
  drafts: readonly ColumnDraft[];
  problem: NameProblem | null;
}) {
  return (
    <Paper component="li" variant="outlined" sx={{ p: 1.5 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'flex-start' }}>
          <TextField
            label="Nombre de la columna"
            value={draft.name}
            onChange={(event) => onRename(draft.key, event.target.value)}
            error={problem !== null}
            helperText={problem ? PROBLEM_TEXT[problem] : null}
            slotProps={{ htmlInput: { maxLength: 100 } }}
            fullWidth
          />
          <IconButton
            aria-label={`Subir la columna «${draft.name}»`}
            disabled={index === 0 || disabled}
            onClick={() => onMoveColumn(index, index - 1)}
            sx={{ mt: 0.5 }}
          >
            <ArrowUpwardIcon />
          </IconButton>
          <IconButton
            aria-label={`Bajar la columna «${draft.name}»`}
            disabled={index === count - 1 || disabled}
            onClick={() => onMoveColumn(index, index + 1)}
            sx={{ mt: 0.5 }}
          >
            <ArrowDownwardIcon />
          </IconButton>
        </Stack>
        <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {draft.stateIds.map((stateId) => {
            const state = statesById.get(stateId);
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
                  onChange={(event) => onMoveState(state.id, event.target.value)}
                  disabled={disabled}
                  sx={{ minWidth: { sm: 220 } }}
                >
                  {drafts.map((option) => (
                    <MenuItem key={option.key} value={option.key}>
                      {option.name.trim() || 'Sin nombre'}
                    </MenuItem>
                  ))}
                  {/* A state alone in its column already has one of its own. */}
                  {draft.stateIds.length > 1 ? (
                    <MenuItem value={NEW_COLUMN}>Una columna nueva</MenuItem>
                  ) : null}
                </TextField>
              </Box>
            ) : null;
          })}
        </Stack>
      </Stack>
    </Paper>
  );
}
