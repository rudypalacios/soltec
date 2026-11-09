import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
  IconButton,
  Link,
  ListSubheader,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState, type ReactNode } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { problemMessage } from '../access/messages';
import { formatMoment } from '../access/formatting';
import { useCan, useCurrentUser } from '../access/SessionContext';
import { historyPath } from '../audit/auditLabels';
import { formatDay, isOverdue } from './dates';
import { ThreadView } from './ThreadView';
import { useSetTaskActive, useTask, useTransitionTask, type Task } from './useTasks';

type NextState = NonNullable<Task['next_states']>[number];

const TRANSITION_ERRORS = {
  forbidden: 'Ese paso le corresponde a la otra persona.',
  conflict:
    'Alguien cambió la tarea mientras la mirabas. Se recargó con lo último; intenta de nuevo.',
  task_inactive: 'La tarea está desactivada. Reactívala para moverla.',
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');

/**
 * `/tareas/:taskId`: a section of its own, laid out like the trackers people already know. The title, the state (one
 * menu, however many states the flow allows) and the actions on top; the description and the activity in the main
 * column; the details in a side panel that moves above them on a phone.
 */
export function TaskDetailPage() {
  const { taskId } = useParams();
  const task = useTask(taskId);
  const can = useCan();

  if (task.isError) {
    return <Alert severity="error">{problemMessage(task.error)}</Alert>;
  }
  if (task.isPending) {
    return <CircularProgress aria-label="Cargando la tarea" />;
  }
  const data = task.data;

  return (
    <Stack spacing={2.5}>
      <TaskHeader task={data} />
      <Box
        sx={{
          display: 'grid',
          gap: 3,
          alignItems: 'start',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) 320px' },
        }}
      >
        <Stack spacing={3} sx={{ order: { xs: 1, md: 0 }, minWidth: 0 }}>
          <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }} component="section">
            <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
              Descripción
            </Typography>
            <Typography
              sx={{
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
                color: data.description ? 'text.primary' : 'text.secondary',
              }}
            >
              {data.description ?? 'Sin descripción.'}
            </Typography>
          </Paper>
          <ThreadView taskId={data.id} canComment={can('thread_entries', 'create')} />
        </Stack>
        <TaskDetails task={data} sx={{ order: { xs: 0, md: 1 } }} />
      </Box>
    </Stack>
  );
}

/** Back link, type and lateness, title, the state menu, and the actions. */
function TaskHeader({ task }: { task: Task }) {
  const can = useCan();
  const setActive = useSetTaskActive();
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const late = isOverdue(task);
  const editable = task.is_active && !task.state.is_terminal && can('tasks', 'edit');
  const hasMenu = can('tasks', 'deactivate') || can('audit_logs', 'view');

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Link
          component={RouterLink}
          to="/tareas"
          underline="none"
          sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, minHeight: 44 }}
        >
          <ArrowBackIcon fontSize="small" />
          Tareas
        </Link>
        <Stack direction="row" spacing={1}>
          {editable ? (
            <Button
              component={RouterLink}
              to={`/tareas/${task.id}/editar`}
              variant="outlined"
              color="inherit"
              sx={{ minHeight: 44 }}
            >
              Editar
            </Button>
          ) : null}
          {hasMenu ? (
            <>
              <IconButton
                aria-label="Más acciones"
                aria-haspopup="menu"
                onClick={(event) => setMenu(event.currentTarget)}
                sx={{ border: 1, borderColor: 'divider', borderRadius: 1, width: 44, height: 44 }}
              >
                <MoreVertIcon />
              </IconButton>
              <Menu anchorEl={menu} open={menu !== null} onClose={() => setMenu(null)}>
                {can('audit_logs', 'view') ? (
                  <MenuItem
                    component={RouterLink}
                    to={historyPath('tasks', task.id)}
                    onClick={() => setMenu(null)}
                    sx={{ minHeight: 44 }}
                  >
                    Ver historial
                  </MenuItem>
                ) : null}
                {can('tasks', 'deactivate') ? (
                  <MenuItem
                    sx={{ minHeight: 44, color: task.is_active ? 'error.main' : undefined }}
                    onClick={() => {
                      setMenu(null);
                      if (task.is_active) {
                        setDeactivating(true);
                      } else {
                        setFailure(null);
                        setActive.mutate(
                          { taskId: task.id, active: true },
                          { onError: (error) => setFailure(problemMessage(error)) },
                        );
                      }
                    }}
                  >
                    {task.is_active ? 'Desactivar' : 'Reactivar'}
                  </MenuItem>
                ) : null}
              </Menu>
            </>
          ) : null}
        </Stack>
      </Stack>

      {!task.is_active ? <Alert severity="info">Esta tarea está desactivada.</Alert> : null}
      {failure ? (
        <Alert severity="error" onClose={() => setFailure(null)}>
          {failure}
        </Alert>
      ) : null}

      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        <Chip size="small" label={task.task_type.name} />
        {late ? <Chip size="small" color="error" variant="outlined" label="Vencida" /> : null}
      </Stack>
      <Typography
        variant="h4"
        component="h1"
        sx={{ fontSize: { xs: 22, md: 28 }, fontWeight: 700, overflowWrap: 'anywhere' }}
      >
        {task.title}
      </Typography>
      <StatusMenu task={task} />

      <ConfirmDialog
        open={deactivating}
        title="Desactivar tarea"
        message={`«${task.title}» dejará de aparecer en las listas activas. Su actividad se conserva.`}
        confirmLabel="Desactivar"
        destructive
        busy={setActive.isPending}
        onConfirm={() =>
          setActive.mutate(
            { taskId: task.id, active: false },
            {
              onError: (error) => setFailure(problemMessage(error)),
              onSettled: () => setDeactivating(false),
            },
          )
        }
        onCancel={() => setDeactivating(false)}
      />
    </Stack>
  );
}

/**
 * The state of the task as one control. With next steps it opens a menu of the states the person may move the task to
 * (the flow can grow to several destinations without growing the screen); without them it is just the state. Choosing
 * a destination asks for confirmation, with an optional reason.
 */
function StatusMenu({ task }: { task: Task }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [step, setStep] = useState<NextState | null>(null);
  const next = task.next_states ?? [];
  const look = {
    bgcolor: task.state.color,
    color: '#fff',
    fontWeight: 600,
    fontSize: 15,
    minHeight: 48,
    px: 2,
    borderRadius: 2,
    justifyContent: 'space-between',
    width: { xs: 1, sm: 'auto' },
    minWidth: { sm: 160 },
    alignSelf: 'flex-start',
  } as const;

  return (
    <>
      {next.length === 0 ? (
        <Box
          sx={{ ...look, display: 'inline-flex', alignItems: 'center' }}
          aria-label={`Estado: ${task.state.name}`}
        >
          {task.state.name}
        </Box>
      ) : (
        <Button
          aria-haspopup="menu"
          aria-expanded={anchor !== null}
          aria-label={`Estado: ${task.state.name}. Cambiar estado`}
          onClick={(event) => setAnchor(event.currentTarget)}
          endIcon={<KeyboardArrowDownIcon />}
          sx={{ ...look, '&:hover': { bgcolor: task.state.color, filter: 'brightness(0.92)' } }}
        >
          {task.state.name}
        </Button>
      )}
      <Menu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { minWidth: 260 } } }}
      >
        <ListSubheader sx={{ lineHeight: '32px', fontSize: 12, letterSpacing: '0.04em' }}>
          PASAR A
        </ListSubheader>
        {next.map((state) => (
          <MenuItem
            key={state.id}
            sx={{ minHeight: 44, gap: 1.5 }}
            onClick={() => {
              setAnchor(null);
              setStep(state);
            }}
          >
            <Box
              aria-hidden
              sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: state.color }}
            />
            {state.name}
          </MenuItem>
        ))}
      </Menu>
      <TransitionDialog task={task} step={step} onClose={() => setStep(null)} />
    </>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'row', md: 'column' },
        justifyContent: 'space-between',
        alignItems: { xs: 'center', md: 'flex-start' },
        gap: { xs: 2, md: 0.5 },
        py: 1.5,
        '&:not(:first-of-type)': { borderTop: 1, borderColor: 'divider' },
      }}
    >
      <Typography variant="body2" color="text.secondary" component="dt">
        {label}
      </Typography>
      <Typography
        component="dd"
        sx={{ m: 0, fontWeight: 500, textAlign: { xs: 'right', md: 'left' } }}
      >
        {children}
      </Typography>
    </Box>
  );
}

function Person({ name }: { name: string }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      <Avatar sx={{ width: 28, height: 28, fontSize: 12 }} aria-hidden>
        {initials(name)}
      </Avatar>
      {name}
    </Box>
  );
}

/** The side panel: who, when and what kind. */
function TaskDetails({ task, sx }: { task: Task; sx?: object }) {
  const late = isOverdue(task);
  return (
    <Paper
      variant="outlined"
      component="aside"
      aria-label="Detalles"
      sx={{ px: 2.5, py: 1, ...sx }}
    >
      <Typography variant="h6" component="h2" sx={{ pt: 1.5 }}>
        Detalles
      </Typography>
      <Box component="dl" sx={{ m: 0 }}>
        <Detail label="Asignada a">
          <Person name={task.assignee.name} />
        </Detail>
        <Detail label="Pedida por">
          <Person name={task.owner.name} />
        </Detail>
        <Detail label="Vence">
          <Box component="span" sx={{ color: late ? 'error.main' : undefined, fontWeight: 600 }}>
            {formatDay(task.due_date)}
          </Box>
        </Detail>
        {task.proposed_due_date ? (
          <Detail label="Fecha propuesta">{formatDay(task.proposed_due_date)}</Detail>
        ) : null}
        <Detail label="Tipo">{task.task_type.name}</Detail>
        <Detail label="Creada">{formatMoment(task.created_at)}</Detail>
      </Box>
    </Paper>
  );
}

/** Confirms a change of state; it can carry a reason and, when the person cannot make the date, another date. */
function TransitionDialog({
  task,
  step,
  onClose,
}: {
  task: Task;
  step: NextState | null;
  onClose: () => void;
}) {
  const me = useCurrentUser();
  const transition = useTransitionTask(task.id);
  const [reason, setReason] = useState('');
  const [proposed, setProposed] = useState('');
  const [accept, setAccept] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const canAccept = me?.id === task.owner.id && task.proposed_due_date !== null;

  const reset = () => {
    setReason('');
    setProposed('');
    setAccept(false);
    setFailure(null);
    onClose();
  };

  return (
    <ConfirmDialog
      open={step !== null}
      title={`Pasar a «${step?.name ?? ''}»`}
      message="El cambio queda en la actividad de la tarea."
      confirmLabel="Confirmar"
      busy={transition.isPending}
      onConfirm={() => {
        if (!step) {
          return;
        }
        setFailure(null);
        transition.mutate(
          {
            state_id: step.id,
            version: task.version,
            reason: reason.trim() || null,
            proposed_due_date: proposed || null,
            accept_proposed_due_date: accept,
          },
          {
            onSuccess: reset,
            onError: (error) => setFailure(problemMessage(error, TRANSITION_ERRORS)),
          },
        );
      }}
      onCancel={reset}
    >
      <Stack spacing={2} sx={{ mt: 2 }}>
        {failure ? <Alert severity="error">{failure}</Alert> : null}
        <TextField
          label="Motivo (opcional)"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          slotProps={{ htmlInput: { maxLength: 1000 } }}
          multiline
          fullWidth
        />
        <TextField
          label="Fecha que propones (opcional)"
          type="date"
          value={proposed}
          onChange={(event) => setProposed(event.target.value)}
          helperText="Si no puedes cumplir la fecha, propón otra."
          slotProps={{ inputLabel: { shrink: true } }}
          fullWidth
        />
        {canAccept ? (
          <FormControlLabel
            control={
              <Checkbox checked={accept} onChange={(event) => setAccept(event.target.checked)} />
            }
            label={`Aceptar la fecha propuesta (${formatDay(task.proposed_due_date ?? '')})`}
          />
        ) : null}
      </Stack>
    </ConfirmDialog>
  );
}
