import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  Checkbox,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PageHeader } from '../../components/PageHeader';
import { problemMessage } from '../access/messages';
import { useCan, useCurrentUser } from '../access/SessionContext';
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

/** `/tareas/:taskId`: the task, the next steps its flow allows the signed-in user, and its activity thread. */
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
  const editable = data.is_active && !data.state.is_terminal && can('tasks', 'edit');

  return (
    <>
      <PageHeader
        title={data.title}
        actions={
          editable ? (
            <Button component={RouterLink} to={`/tareas/${data.id}/editar`} variant="outlined">
              Editar
            </Button>
          ) : null
        }
      />
      <Stack spacing={3}>
        <TaskSummary task={data} />
        <ThreadView taskId={data.id} canComment={can('thread_entries', 'create')} />
      </Stack>
    </>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography component="div">{children}</Typography>
    </Box>
  );
}

function TaskSummary({ task }: { task: Task }) {
  const can = useCan();
  const setActive = useSetTaskActive();
  const [step, setStep] = useState<NextState | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const late = isOverdue(task);

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
      <Stack spacing={2}>
        {!task.is_active ? <Alert severity="info">Esta tarea está desactivada.</Alert> : null}
        {failure ? (
          <Alert severity="error" onClose={() => setFailure(null)}>
            {failure}
          </Alert>
        ) : null}
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{ flexWrap: 'wrap', alignItems: 'center' }}
        >
          <Chip
            label={task.state.name}
            sx={{ bgcolor: task.state.color, color: '#fff', fontWeight: 600 }}
          />
          {late ? <Chip label="Vencida" color="error" variant="outlined" /> : null}
          <Chip label={task.task_type.name} variant="outlined" />
        </Stack>
        {task.description ? (
          <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {task.description}
          </Typography>
        ) : null}
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
          }}
        >
          <Detail label="Pedida por">{task.owner.name}</Detail>
          <Detail label="Asignada a">{task.assignee.name}</Detail>
          <Detail label="Vence">{formatDay(task.due_date)}</Detail>
          {task.proposed_due_date ? (
            <Detail label="Fecha propuesta">{formatDay(task.proposed_due_date)}</Detail>
          ) : null}
        </Box>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {(task.next_states ?? []).map((next) => (
            <Button key={next.id} variant="outlined" onClick={() => setStep(next)}>
              Pasar a «{next.name}»
            </Button>
          ))}
          {can('tasks', 'deactivate') ? (
            <Button
              color={task.is_active ? 'error' : 'inherit'}
              onClick={() =>
                task.is_active
                  ? setDeactivating(true)
                  : setActive.mutate(
                      { taskId: task.id, active: true },
                      { onError: (error) => setFailure(problemMessage(error)) },
                    )
              }
            >
              {task.is_active ? 'Desactivar' : 'Reactivar'}
            </Button>
          ) : null}
        </Stack>
      </Stack>

      <TransitionDialog task={task} step={step} onClose={() => setStep(null)} />
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
