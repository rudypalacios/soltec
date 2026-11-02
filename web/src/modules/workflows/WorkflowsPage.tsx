import AddIcon from '@mui/icons-material/Add';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormHelperText,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ACTION_ICONS } from '../../components/actionIcons';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataList, type DataColumn } from '../../components/DataList';
import type { RowAction } from '../../components/RowActions';
import { SectionNav } from '../../components/SectionNav';
import { ActiveBadge } from '../../components/StatusBadge';
import { statusPalette } from '../../theme/tokens';
import { fieldMessages, problemMessage } from '../access/messages';
import { useCan } from '../access/SessionContext';
import { ColorField } from '../parameters/ColorField';
import {
  useReorderWorkflowStates,
  useSaveWorkflowState,
  useSetWorkflowStateActive,
  useSetWorkflowTransitions,
  useWorkflowStates,
} from './useWorkflowStates';
import {
  transitionPairs,
  WORKFLOW_FLOWS,
  type WorkflowCode,
  type WorkflowState,
} from './workflowFlows';

const RESOURCE = 'workflow_states';
const TAB_PARAM = 'flujo';

/** What the user reads for each refusal of the API that this screen can cause. */
const STATE_PROBLEMS = {
  state_is_initial:
    'No se puede desactivar el estado inicial. Marca otro estado como inicial primero.',
  last_terminal_state: 'El flujo necesita al menos un estado final activo.',
  conflict: 'Otra persona cambió este flujo. Cierra esta ventana y vuelve a intentarlo.',
};

/** `/configuracion/flujos`: the states of the task and ticket flows and which state may follow which. */
export function WorkflowsPage() {
  const [params, setParams] = useSearchParams();
  const flow = WORKFLOW_FLOWS.find((candidate) => candidate.code === params.get(TAB_PARAM));
  const current = flow ?? WORKFLOW_FLOWS[0];

  return (
    <SectionNav
      label="Flujos de estado"
      value={current.code}
      onChange={(code) => setParams({ [TAB_PARAM]: code }, { replace: true })}
      placement="top"
      items={WORKFLOW_FLOWS.map((candidate) => ({ value: candidate.code, label: candidate.label }))}
    >
      {/* Keyed so each flow starts with its own dialogs and messages. */}
      <FlowEditor key={current.code} workflow={current.code} noun={current.noun} />
    </SectionNav>
  );
}

type Dialog =
  | { kind: 'state'; state: WorkflowState | null }
  | { kind: 'transitions'; state: WorkflowState }
  | { kind: 'order' };

/** A dot in the color of a state followed by its name. */
function ColoredName({ state }: { state: WorkflowState }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      <Box
        component="span"
        aria-hidden
        data-testid="state-dot"
        sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: state.color, flexShrink: 0 }}
      />
      {state.name}
    </Box>
  );
}

function FlowEditor({ workflow, noun }: { workflow: WorkflowCode; noun: string }) {
  const can = useCan();
  const states = useWorkflowStates(workflow);
  const setActive = useSetWorkflowStateActive(workflow);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  // Kept after closing (`open` false) so the confirmation does not lose its text while it fades out.
  const [pending, setPending] = useState<{
    state: WorkflowState;
    activate: boolean;
    open: boolean;
  } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const rows = states.data;
  const names = new Map((rows ?? []).map((state) => [state.id, state.name]));
  const activeCount = (rows ?? []).filter((state) => state.is_active).length;

  const confirm = async () => {
    if (!pending) {
      return;
    }
    setFailure(null);
    try {
      await setActive.mutateAsync({ stateId: pending.state.id, active: pending.activate });
    } catch (error) {
      setFailure(
        problemMessage(error, {
          ...STATE_PROBLEMS,
          validation_failed: `Ya hay un estado activo llamado «${pending.state.name}». Renombra uno de los dos primero.`,
        }),
      );
    } finally {
      setPending({ ...pending, open: false });
    }
  };

  const actionsFor = (state: WorkflowState): RowAction[] => {
    const actions: RowAction[] = [];
    if (can(RESOURCE, 'edit')) {
      actions.push({
        key: 'edit',
        label: 'Editar',
        icon: ACTION_ICONS.edit,
        onSelect: () => setDialog({ kind: 'state', state }),
      });
      if (state.is_active) {
        actions.push({
          key: 'transitions',
          label: 'Siguientes estados',
          icon: ACTION_ICONS.transitions,
          onSelect: () => setDialog({ kind: 'transitions', state }),
        });
      }
    }
    if (can(RESOURCE, 'deactivate')) {
      actions.push({
        key: 'toggle',
        label: state.is_active ? 'Desactivar' : 'Reactivar',
        icon: state.is_active ? ACTION_ICONS.deactivate : ACTION_ICONS.reactivate,
        tone: state.is_active ? 'danger' : undefined,
        onSelect: () => setPending({ state, activate: !state.is_active, open: true }),
      });
    }
    return actions;
  };

  const columns: DataColumn<WorkflowState>[] = [
    {
      id: 'name',
      header: 'Estado',
      mobile: 'title',
      minWidth: 180,
      render: (state) => <ColoredName state={state} />,
    },
    {
      // Blank when the state is neither: a dash in every card of a phone would be noise.
      id: 'marks',
      header: 'Función',
      mobile: 'subtitle',
      render: (state) =>
        state.is_initial || state.is_terminal ? (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', pt: 0.5 }}>
            {state.is_initial ? <Chip size="small" label="Inicial" /> : null}
            {state.is_terminal ? <Chip size="small" label="Final" /> : null}
          </Box>
        ) : null,
    },
    {
      id: 'next',
      header: 'Puede pasar a',
      mobile: 'meta',
      minWidth: 200,
      render: (state) =>
        state.transitions_to.length === 0
          ? '—'
          : state.transitions_to.map((id) => names.get(id) ?? '?').join(', '),
    },
    {
      id: 'status',
      header: 'Estado',
      mobile: 'badge',
      nowrap: true,
      render: (state) => <ActiveBadge active={state.is_active} />,
    },
  ];

  return (
    <>
      {can(RESOURCE, 'create') || (can(RESOURCE, 'edit') && activeCount > 1) ? (
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', mb: 2 }}>
          {can(RESOURCE, 'edit') && activeCount > 1 ? (
            <Button variant="outlined" onClick={() => setDialog({ kind: 'order' })}>
              Ordenar estados
            </Button>
          ) : null}
          {can(RESOURCE, 'create') ? (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setDialog({ kind: 'state', state: null })}
            >
              Nuevo estado
            </Button>
          ) : null}
        </Stack>
      ) : null}

      {failure ? (
        <Alert severity="error" onClose={() => setFailure(null)} sx={{ mb: 2 }}>
          {failure}
        </Alert>
      ) : null}

      <DataList
        label={`Estados de ${noun}`}
        noun="estados"
        columns={columns}
        rows={rows}
        error={states.isError ? problemMessage(states.error) : null}
        getRowId={(state) => state.id}
        getRowName={(state) => state.name}
        isInactive={(state) => !state.is_active}
        getActions={actionsFor}
      />

      {dialog?.kind === 'state' ? (
        <StateDialog workflow={workflow} state={dialog.state} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'transitions' && rows ? (
        <TransitionsDialog
          workflow={workflow}
          states={rows}
          state={dialog.state}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'order' && rows ? (
        <OrderDialog workflow={workflow} states={rows} onClose={() => setDialog(null)} />
      ) : null}

      <ConfirmDialog
        open={pending?.open === true}
        title={pending?.activate ? 'Reactivar estado' : 'Desactivar estado'}
        message={
          pending?.activate
            ? `«${pending.state.name}» volverá a ofrecerse, con los siguientes estados que tenía.`
            : `«${pending?.state.name ?? ''}» dejará de ofrecerse como destino. Los registros que ya están en este estado lo conservan.`
        }
        confirmLabel={pending?.activate ? 'Reactivar' : 'Desactivar'}
        destructive={pending?.activate === false}
        busy={setActive.isPending}
        onConfirm={() => void confirm()}
        onCancel={() => setPending(pending && { ...pending, open: false })}
      />
    </>
  );
}

/** Creates a state (`state` null) or edits one. */
function StateDialog({
  workflow,
  state,
  onClose,
}: {
  workflow: WorkflowCode;
  state: WorkflowState | null;
  onClose: () => void;
}) {
  const save = useSaveWorkflowState(workflow);
  const [name, setName] = useState(state?.name ?? '');
  const [color, setColor] = useState<string>(state?.color ?? statusPalette[0].value);
  const [isTerminal, setIsTerminal] = useState(state?.is_terminal ?? false);
  const [makeInitial, setMakeInitial] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const isInitial = state?.is_initial === true || makeInitial;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors({});
    setFailure(null);
    try {
      await save.mutateAsync({
        name: name.trim(),
        color,
        isTerminal: isInitial ? false : isTerminal,
        makeInitial,
        id: state?.id,
        version: state?.version,
      });
      onClose();
    } catch (error) {
      const fields = fieldMessages(error, {
        name: { taken: 'Ya hay un estado activo con ese nombre en este flujo.' },
        is_terminal: { initial_cannot_be_terminal: 'El estado inicial no puede ser final.' },
        is_initial: { inactive_state: 'Un estado desactivado no puede ser el inicial.' },
      });
      setErrors(fields);
      setFailure(Object.keys(fields).length > 0 ? null : problemMessage(error, STATE_PROBLEMS));
    }
  };

  return (
    <Dialog
      open
      onClose={save.isPending ? undefined : onClose}
      fullWidth
      maxWidth="xs"
      aria-labelledby="state-dialog-title"
    >
      <form onSubmit={(event) => void submit(event)} noValidate>
        <DialogTitle id="state-dialog-title">
          {state ? 'Editar estado' : 'Nuevo estado'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {failure ? <Alert severity="error">{failure}</Alert> : null}
            <TextField
              label="Nombre"
              value={name}
              onChange={(event) => setName(event.target.value)}
              error={errors.name !== undefined}
              helperText={errors.name}
              slotProps={{ htmlInput: { maxLength: 100 } }}
              required
              fullWidth
              autoFocus
            />
            <ColorField value={color} onChange={setColor} disabled={save.isPending} />
            <Box>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={isInitial ? false : isTerminal}
                    disabled={isInitial}
                    onChange={(event) => setIsTerminal(event.target.checked)}
                  />
                }
                label="Estado final (cierra el registro)"
              />
              {errors.is_terminal ? (
                <FormHelperText error>{errors.is_terminal}</FormHelperText>
              ) : null}
            </Box>
            {state?.is_active ? (
              <Box>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={isInitial}
                      disabled={state.is_initial}
                      onChange={(event) => setMakeInitial(event.target.checked)}
                    />
                  }
                  label="Estado inicial (donde empieza un registro nuevo)"
                />
                {state.is_initial ? (
                  <FormHelperText>Para cambiarlo, marca otro estado como inicial.</FormHelperText>
                ) : null}
                {errors.is_initial ? (
                  <FormHelperText error>{errors.is_initial}</FormHelperText>
                ) : null}
              </Box>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" color="inherit" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" variant="contained" disabled={save.isPending || !name.trim()}>
            Guardar
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/** Chooses which active states a record in `state` may move to. */
function TransitionsDialog({
  workflow,
  states,
  state,
  onClose,
}: {
  workflow: WorkflowCode;
  states: readonly WorkflowState[];
  state: WorkflowState;
  onClose: () => void;
}) {
  const save = useSetWorkflowTransitions(workflow);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set(state.transitions_to));
  const [failure, setFailure] = useState<string | null>(null);
  const candidates = states.filter((other) => other.is_active && other.id !== state.id);

  const toggle = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    setSelected(next);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    // In the order of the flow, so the request does not depend on the order of the clicks.
    const destinations = candidates
      .filter((other) => selected.has(other.id))
      .map((other) => other.id);
    try {
      await save.mutateAsync(transitionPairs(states, state.id, destinations));
      onClose();
    } catch (error) {
      setFailure(problemMessage(error, STATE_PROBLEMS));
    }
  };

  return (
    <Dialog
      open
      onClose={save.isPending ? undefined : onClose}
      fullWidth
      maxWidth="xs"
      aria-labelledby="transitions-dialog-title"
    >
      <form onSubmit={(event) => void submit(event)} noValidate>
        <DialogTitle id="transitions-dialog-title">
          Siguientes estados de «{state.name}»
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ pt: 1 }}>
            {failure ? <Alert severity="error">{failure}</Alert> : null}
            <Typography variant="body2" color="text.secondary">
              Un registro en «{state.name}» podrá pasar a los estados que marques.
            </Typography>
            {candidates.length === 0 ? (
              <Typography>No hay otros estados activos.</Typography>
            ) : (
              candidates.map((other) => (
                <FormControlLabel
                  key={other.id}
                  control={
                    <Checkbox
                      checked={selected.has(other.id)}
                      onChange={(event) => toggle(other.id, event.target.checked)}
                    />
                  }
                  label={<ColoredName state={other} />}
                />
              ))
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" color="inherit" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" variant="contained" disabled={save.isPending}>
            Guardar
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/** Puts the active states in order. Nothing is saved until «Guardar orden», so moving them back and forth is free. */
function OrderDialog({
  workflow,
  states,
  onClose,
}: {
  workflow: WorkflowCode;
  states: readonly WorkflowState[];
  onClose: () => void;
}) {
  const save = useReorderWorkflowStates(workflow);
  const original = states.filter((state) => state.is_active);
  const [order, setOrder] = useState<readonly WorkflowState[]>(original);
  const [failure, setFailure] = useState<string | null>(null);
  const changed = order.some((state, index) => state.id !== original[index]?.id);

  const move = (index: number, by: -1 | 1) => {
    const next = [...order];
    const [item] = next.splice(index, 1);
    if (item === undefined) {
      return;
    }
    next.splice(index + by, 0, item);
    setOrder(next);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    try {
      await save.mutateAsync(order.map((state) => state.id));
      onClose();
    } catch (error) {
      setFailure(problemMessage(error, STATE_PROBLEMS));
    }
  };

  return (
    <Dialog
      open
      onClose={save.isPending ? undefined : onClose}
      fullWidth
      maxWidth="xs"
      aria-labelledby="order-dialog-title"
    >
      <form onSubmit={(event) => void submit(event)} noValidate>
        <DialogTitle id="order-dialog-title">Ordenar estados</DialogTitle>
        <DialogContent>
          {failure ? (
            <Alert severity="error" sx={{ mb: 1 }}>
              {failure}
            </Alert>
          ) : null}
          <List dense aria-label="Orden de los estados">
            {order.map((state, index) => (
              <ListItem
                key={state.id}
                disableGutters
                secondaryAction={
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <IconButton
                      aria-label={`Subir «${state.name}»`}
                      disabled={index === 0 || save.isPending}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUpwardIcon />
                    </IconButton>
                    <IconButton
                      aria-label={`Bajar «${state.name}»`}
                      disabled={index === order.length - 1 || save.isPending}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDownwardIcon />
                    </IconButton>
                  </Box>
                }
              >
                <ListItemText
                  primary={<ColoredName state={state} />}
                  slotProps={{ primary: { sx: { pr: 12, overflowWrap: 'anywhere' } } }}
                />
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" color="inherit" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" variant="contained" disabled={save.isPending || !changed}>
            Guardar orden
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
