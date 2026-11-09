import AddIcon from '@mui/icons-material/Add';
import { Alert, Button, Link, MenuItem, TextField } from '@mui/material';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ACTION_ICONS } from '../../components/actionIcons';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataList, type DataColumn } from '../../components/DataList';
import { FilterBar } from '../../components/FilterBar';
import { PageHeader } from '../../components/PageHeader';
import type { RowAction } from '../../components/RowActions';
import { StatusFilter } from '../../components/StatusFilter';
import { useListFilters } from '../../components/useListFilters';
import { problemMessage } from '../access/messages';
import { useCan } from '../access/SessionContext';
import { formatDay, isOverdue } from './dates';
import { useSetTaskActive, useTasks, type Task } from './useTasks';

const PER_PAGE = 25;
const RELATIONS = [
  { value: 'any', label: 'Todas las que veo' },
  { value: 'assigned', label: 'Asignadas a mí' },
  { value: 'owned', label: 'Las que pedí' },
] as const;
type Relation = (typeof RELATIONS)[number]['value'];

/** `/tareas`: the tasks the signed-in user reaches, the ones due first. */
export function TasksPage() {
  const can = useCan();
  const filters = useListFilters();
  const [relation, setRelation] = useState<Relation>('any');
  const [pending, setPending] = useState<{ task: Task; activate: boolean; open: boolean } | null>(
    null,
  );
  const [failure, setFailure] = useState<string | null>(null);

  const tasks = useTasks({
    q: filters.query,
    status: filters.status,
    relation,
    page: filters.page + 1,
    per_page: PER_PAGE,
  });
  const setActive = useSetTaskActive();

  const confirm = async () => {
    if (!pending) {
      return;
    }
    setFailure(null);
    try {
      await setActive.mutateAsync({ taskId: pending.task.id, active: pending.activate });
    } catch (error) {
      setFailure(problemMessage(error));
    } finally {
      setPending({ ...pending, open: false });
    }
  };

  const actionsFor = (task: Task): RowAction[] => {
    const actions: RowAction[] = [
      { key: 'open', label: 'Abrir', icon: ACTION_ICONS.view, to: `/tareas/${task.id}` },
    ];
    if (can('tasks', 'deactivate')) {
      actions.push({
        key: 'toggle',
        label: task.is_active ? 'Desactivar' : 'Reactivar',
        icon: task.is_active ? ACTION_ICONS.deactivate : ACTION_ICONS.reactivate,
        tone: task.is_active ? 'danger' : undefined,
        onSelect: () => setPending({ task, activate: !task.is_active, open: true }),
      });
    }
    return actions;
  };

  return (
    <>
      <PageHeader
        title="Tareas"
        actions={
          can('tasks', 'create') ? (
            <Button
              component={RouterLink}
              to="/tareas/nueva"
              variant="contained"
              startIcon={<AddIcon />}
            >
              Nueva tarea
            </Button>
          ) : null
        }
      />

      <FilterBar
        searchLabel="Buscar por título"
        search={filters.text}
        onSearchChange={filters.setText}
      >
        <TextField
          select
          label="Mostrar"
          value={relation}
          onChange={(event) => {
            setRelation(event.target.value as Relation);
            filters.setPage(0);
          }}
          sx={{ minWidth: 200 }}
        >
          {RELATIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
        <StatusFilter value={filters.status} onChange={filters.setStatus} />
      </FilterBar>

      {failure ? (
        <Alert severity="error" onClose={() => setFailure(null)} sx={{ mb: 2 }}>
          {failure}
        </Alert>
      ) : null}

      <DataList
        label="Lista de tareas"
        noun="tareas"
        columns={COLUMNS}
        rows={tasks.data?.data}
        error={tasks.isError ? problemMessage(tasks.error) : null}
        getRowId={(task) => task.id}
        getRowName={(task) => task.title}
        isInactive={(task) => !task.is_active}
        getActions={actionsFor}
        pagination={{
          page: filters.page,
          perPage: PER_PAGE,
          total: tasks.data?.meta.total ?? 0,
          onPageChange: filters.setPage,
        }}
      />

      <ConfirmDialog
        open={pending?.open === true}
        title={pending?.activate ? 'Reactivar tarea' : 'Desactivar tarea'}
        message={
          pending?.activate
            ? `«${pending.task.title}» volverá a aparecer en las listas.`
            : `«${pending?.task.title ?? ''}» dejará de aparecer en las listas activas. Su actividad se conserva.`
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

const COLUMNS: DataColumn<Task>[] = [
  {
    id: 'title',
    header: 'Tarea',
    mobile: 'title',
    minWidth: 200,
    render: (task) => (
      <Link component={RouterLink} to={`/tareas/${task.id}`} underline="hover" color="inherit">
        {task.title}
      </Link>
    ),
  },
  {
    id: 'type',
    header: 'Tipo',
    mobile: 'subtitle',
    nowrap: true,
    render: (task) => task.task_type.name,
  },
  { id: 'assignee', header: 'Asignada a', mobile: 'meta', render: (task) => task.assignee.name },
  { id: 'owner', header: 'Pedida por', mobile: 'hidden', render: (task) => task.owner.name },
  {
    id: 'due',
    header: 'Vence',
    mobile: 'meta',
    nowrap: true,
    render: (task) => (
      <span style={isOverdue(task) ? { color: '#B3261E', fontWeight: 600 } : undefined}>
        {formatDay(task.due_date)}
        {isOverdue(task) ? ' · vencida' : ''}
      </span>
    ),
  },
  {
    id: 'state',
    header: 'Estado',
    mobile: 'badge',
    nowrap: true,
    render: (task) => (
      <span style={{ color: task.state.color, fontWeight: 600 }}>{task.state.name}</span>
    ),
  },
];
