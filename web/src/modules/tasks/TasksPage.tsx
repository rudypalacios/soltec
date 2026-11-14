import AddIcon from '@mui/icons-material/Add';
import {
  Alert,
  Button,
  Link,
  MenuItem,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
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
import { ConfigureBoardButton } from '../workflows/ConfigureBoardButton';
import { TaskBoard } from './TaskBoard';
import { useSetTaskActive, useTasks, type Task } from './useTasks';

const PER_PAGE = 25;
const RELATIONS = [
  { value: 'any', label: 'Todas las que veo' },
  { value: 'assigned', label: 'Asignadas a mí' },
  { value: 'owned', label: 'Las que pedí' },
] as const;
type Relation = (typeof RELATIONS)[number]['value'];

const VIEWS = [
  { value: 'lista', label: 'Lista' },
  { value: 'tablero', label: 'Tablero' },
] as const;
type View = (typeof VIEWS)[number]['value'];
const VIEW_PARAM = 'vista';
const VIEW_STORAGE_KEY = 'soltec.tasks.view';

/** The view the person used last, so coming back from a task lands where they were. The browser may refuse storage. */
function rememberedView(): View {
  try {
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === 'tablero' ? 'tablero' : 'lista';
  } catch {
    return 'lista';
  }
}

function remember(view: View): void {
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    // Without storage the view simply is not remembered.
  }
}

/**
 * `/tareas`: the tasks the signed-in user reaches, as a list (the ones due first) or as a board with a column per
 * group of states. Both views share the filter bar; the address (`?vista=tablero`) says which one is open.
 */
export function TasksPage() {
  const can = useCan();
  const filters = useListFilters();
  const [relation, setRelation] = useState<Relation>('any');
  const [params, setParams] = useSearchParams();
  const asked = params.get(VIEW_PARAM);
  const view: View = asked === 'tablero' || asked === 'lista' ? asked : rememberedView();

  const chooseView = (next: View | null) => {
    if (next === null) {
      return;
    }
    remember(next);
    setParams({ [VIEW_PARAM]: next }, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Tareas"
        actions={
          <>
            {view === 'tablero' ? <ConfigureBoardButton workflow="task" iconOnPhone /> : null}
            <ToggleButtonGroup
              exclusive
              size="small"
              value={view}
              onChange={(_event, next: View | null) => chooseView(next)}
              aria-label="Vista"
              sx={{ '& .MuiToggleButton-root': { minHeight: 44, px: 2 } }}
            >
              {VIEWS.map((option) => (
                <ToggleButton key={option.value} value={option.value}>
                  {option.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            {can('tasks', 'create') ? (
              <Button
                component={RouterLink}
                to="/tareas/nueva"
                variant="contained"
                startIcon={<AddIcon />}
              >
                Nueva tarea
              </Button>
            ) : null}
          </>
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

      {view === 'tablero' ? (
        <TaskBoard filters={{ q: filters.query, status: filters.status, relation }} />
      ) : (
        <TaskListView filters={filters} relation={relation} />
      )}
    </>
  );
}

/** The table of tasks (a list of cards on a phone), with its paging and the confirmation to deactivate. */
function TaskListView({
  filters,
  relation,
}: {
  filters: ReturnType<typeof useListFilters>;
  relation: Relation;
}) {
  const can = useCan();
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
