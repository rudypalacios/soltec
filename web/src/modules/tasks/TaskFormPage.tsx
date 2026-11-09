import { Alert, Autocomplete, Button, CircularProgress, MenuItem, TextField } from '@mui/material';
import type { components } from '@soltec/shared';
import { useDeferredValue, useState, type FormEvent } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { FormActions, FormPage } from '../../components/FormPage';
import { PageHeader } from '../../components/PageHeader';
import { fieldMessages, problemMessage } from '../access/messages';
import {
  useAssigneeOptions,
  useCreateTask,
  useTaskForEdit,
  useTaskTypeOptions,
  useUpdateTask,
  type Task,
} from './useTasks';

type NamedRef = components['schemas']['NamedRef'];

const FIELD_MESSAGES = {
  assignee_id: {
    same_as_owner: 'Elige a otra persona: quien pide la tarea no puede ser quien la hace.',
    not_found: 'Esa persona ya no está activa.',
  },
  task_type_id: { not_found: 'Ese tipo ya no está disponible.' },
  due_date: { invalid: 'Elige una fecha válida.' },
};

const SAVE_CONFLICTS = {
  conflict:
    'Otra persona cambió esta tarea mientras la editabas. Recarga la página para ver sus cambios.',
  task_closed: 'La tarea ya está cerrada y no se puede cambiar.',
  task_inactive: 'La tarea está desactivada. Reactívala para cambiarla.',
};

/** `/tareas/nueva`: whoever creates a task becomes its owner. */
export function TaskCreatePage() {
  return (
    <>
      <PageHeader title="Nueva tarea" />
      <TaskForm task={null} />
    </>
  );
}

/** `/tareas/:taskId/editar`. */
export function TaskEditPage() {
  const { taskId } = useParams();
  const task = useTaskForEdit(taskId);

  if (task.isError) {
    return <Alert severity="error">{problemMessage(task.error)}</Alert>;
  }
  if (task.isPending) {
    return <CircularProgress aria-label="Cargando la tarea" />;
  }
  return (
    <>
      <PageHeader title="Editar tarea" />
      <TaskForm key={`${task.data.id}:${task.data.version}`} task={task.data} />
    </>
  );
}

/** The person a task is assigned to, searched by name. */
function AssigneeSelect({
  value,
  onChange,
  error,
}: {
  value: NamedRef | null;
  onChange: (person: NamedRef | null) => void;
  error?: string;
}) {
  const [text, setText] = useState(value?.name ?? '');
  const [search, setSearch] = useState('');
  const deferred = useDeferredValue(search);
  const options = useAssigneeOptions(deferred.trim());
  const found: NamedRef[] = options.data?.data ?? [];
  const choices =
    value && !found.some((person) => person.id === value.id) ? [value, ...found] : found;

  return (
    <Autocomplete
      options={choices}
      loading={options.isFetching}
      value={value}
      onChange={(_, person) => onChange(person)}
      inputValue={text}
      onInputChange={(_, next, reason) => {
        setText(next);
        setSearch(reason === 'input' ? next : '');
      }}
      filterOptions={(all) => all}
      getOptionLabel={(person) => person.name}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      noOptionsText={options.isError ? problemMessage(options.error) : 'Nadie coincide'}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Asignada a"
          required
          error={Boolean(error)}
          helperText={error ?? 'Quien debe hacerla. Puede ser cualquier persona activa.'}
        />
      )}
    />
  );
}

function TaskForm({ task }: { task: Task | null }) {
  const navigate = useNavigate();
  const create = useCreateTask();
  const update = useUpdateTask(task?.id ?? '');
  const types = useTaskTypeOptions();
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [typeId, setTypeId] = useState(task?.task_type.id ?? '');
  const [assignee, setAssignee] = useState<NamedRef | null>(task?.assignee ?? null);
  const [dueDate, setDueDate] = useState(task?.due_date ?? '');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);

  const typeChoices = [
    ...(types.data?.data ?? []),
    // The type the task already has stays selectable even if it was deactivated since.
    ...(task && !(types.data?.data ?? []).some((type) => type.id === task.task_type.id)
      ? [task.task_type]
      : []),
  ];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFieldErrors({});
    setFailure(null);
    if (!assignee) {
      return;
    }
    const data = {
      title: title.trim(),
      description: description.trim() || null,
      task_type_id: typeId,
      assignee_id: assignee.id,
      due_date: dueDate,
    };
    try {
      const saved = task
        ? await update.mutateAsync({ ...data, version: task.version })
        : await create.mutateAsync(data);
      navigate(`/tareas/${saved.id}`);
    } catch (error) {
      const fields = fieldMessages(error, FIELD_MESSAGES);
      setFieldErrors(fields);
      setFailure(Object.keys(fields).length === 0 ? problemMessage(error, SAVE_CONFLICTS) : null);
    }
  };

  return (
    <FormPage onSubmit={(event) => void submit(event)}>
      {failure ? <Alert severity="error">{failure}</Alert> : null}
      <TextField
        label="Título"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        error={Boolean(fieldErrors.title)}
        helperText={fieldErrors.title}
        slotProps={{ htmlInput: { maxLength: 150 } }}
        required
        autoFocus
        fullWidth
      />
      <TextField
        label="Descripción"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        error={Boolean(fieldErrors.description)}
        helperText={fieldErrors.description}
        slotProps={{ htmlInput: { maxLength: 5000 } }}
        multiline
        minRows={3}
        fullWidth
      />
      <TextField
        select
        label="Tipo"
        value={typeId}
        onChange={(event) => setTypeId(event.target.value)}
        error={Boolean(fieldErrors.task_type_id)}
        helperText={fieldErrors.task_type_id}
        slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
        required
        fullWidth
      >
        <MenuItem value="" disabled>
          Elige un tipo
        </MenuItem>
        {typeChoices.map((type) => (
          <MenuItem key={type.id} value={type.id}>
            {type.name}
          </MenuItem>
        ))}
      </TextField>
      <AssigneeSelect value={assignee} onChange={setAssignee} error={fieldErrors.assignee_id} />
      <TextField
        label="Vence"
        type="date"
        value={dueDate}
        onChange={(event) => setDueDate(event.target.value)}
        error={Boolean(fieldErrors.due_date)}
        helperText={fieldErrors.due_date}
        slotProps={{ inputLabel: { shrink: true } }}
        required
        fullWidth
      />
      <FormActions>
        <Button
          component={RouterLink}
          to={task ? `/tareas/${task.id}` : '/tareas'}
          variant="outlined"
          color="inherit"
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={
            create.isPending ||
            update.isPending ||
            !title.trim() ||
            !typeId ||
            !assignee ||
            !dueDate
          }
        >
          Guardar
        </Button>
      </FormActions>
    </FormPage>
  );
}
