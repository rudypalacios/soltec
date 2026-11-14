import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Link,
  Paper,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useIsMobile } from '../../components/useIsMobile';
import { problemMessage } from '../access/messages';
import { formatDay, isOverdue } from './dates';
import {
  BOARD_PAGE_SIZE,
  useLoadBoardColumnPage,
  useTaskBoard,
  type Task,
  type TaskBoardColumn,
  type TaskBoardFilters,
} from './useTasks';

/** A column loaded past its first page: what came back, which page it was and whether it was the last. */
interface MoreOfColumn {
  tasks: Task[];
  page: number;
  done: boolean;
}

/**
 * The board of `/tareas`: one column per group of states of the flow (the company decides the groups in Flujos de
 * estado), the cards ordered by due date. A card opens its task; the state is changed there. On a desktop the
 * columns sit side by side; on a phone a tab per column shows one list at a time.
 */
export function TaskBoard({ filters }: { filters: TaskBoardFilters }) {
  const isMobile = useIsMobile();
  const board = useTaskBoard(filters);
  const loadPage = useLoadBoardColumnPage(filters);
  const [selected, setSelected] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // What «Ver más» loaded belongs to the board it was loaded for: a refresh brings fresh first pages, so it is dropped.
  const [more, setMore] = useState<{ base: unknown; columns: Record<string, MoreOfColumn> }>({
    base: null,
    columns: {},
  });
  const extras = more.base === board.data ? more.columns : {};

  if (board.isError) {
    return <Alert severity="error">{problemMessage(board.error)}</Alert>;
  }
  if (!board.data) {
    return <BoardSkeleton />;
  }
  const columns = board.data;

  const loadMore = async (column: TaskBoardColumn) => {
    const loaded = extras[column.id];
    const page = (loaded?.page ?? 1) + 1;
    setFailure(null);
    try {
      const result = await loadPage.mutateAsync({ columnId: column.id, page });
      const incoming = result[0]?.tasks ?? [];
      setMore((current) => {
        const kept = current.base === board.data ? current.columns : {};
        const before = kept[column.id]?.tasks ?? [];
        return {
          base: board.data,
          columns: {
            ...kept,
            [column.id]: {
              tasks: [...before, ...incoming],
              page,
              done: incoming.length < BOARD_PAGE_SIZE,
            },
          },
        };
      });
    } catch (error) {
      setFailure(problemMessage(error));
    }
  };

  const shown = (column: TaskBoardColumn): Task[] => {
    const seen = new Set<string>();
    return [...column.tasks, ...(extras[column.id]?.tasks ?? [])].filter((task) => {
      if (seen.has(task.id)) {
        return false;
      }
      seen.add(task.id);
      return true;
    });
  };
  const hasMore = (column: TaskBoardColumn) =>
    extras[column.id]?.done !== true &&
    column.tasks.length >= BOARD_PAGE_SIZE &&
    shown(column).length < column.total;

  const renderColumn = (column: TaskBoardColumn) => (
    <BoardColumn
      key={column.id}
      column={column}
      tasks={shown(column)}
      hasMore={hasMore(column)}
      loading={loadPage.isPending && loadPage.variables.columnId === column.id}
      onLoadMore={() => void loadMore(column)}
      showTitle={!isMobile}
    />
  );

  return (
    <Stack spacing={2}>
      {failure ? (
        <Alert severity="error" onClose={() => setFailure(null)}>
          {failure}
        </Alert>
      ) : null}
      {isMobile ? (
        <MobileBoard
          columns={columns}
          selectedId={selected}
          onSelect={setSelected}
          render={renderColumn}
        />
      ) : (
        <Box
          role="group"
          aria-label="Tablero de tareas"
          sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', overflowX: 'auto', pb: 1 }}
        >
          {columns.map(renderColumn)}
        </Box>
      )}
    </Stack>
  );
}

/** A tab per column with its count, and the column of the selected tab below. */
function MobileBoard({
  columns,
  selectedId,
  onSelect,
  render,
}: {
  columns: readonly TaskBoardColumn[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  render: (column: TaskBoardColumn) => React.ReactNode;
}) {
  const current = columns.find((column) => column.id === selectedId) ?? columns[0];
  if (!current) {
    return <Typography>No hay columnas en el tablero.</Typography>;
  }
  return (
    <>
      <Tabs
        value={current.id}
        onChange={(_event, id: string) => onSelect(id)}
        variant="scrollable"
        allowScrollButtonsMobile
        aria-label="Columnas del tablero"
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        {columns.map((column) => (
          <Tab
            key={column.id}
            value={column.id}
            label={`${column.name} (${column.total})`}
            sx={{ minHeight: 44 }}
          />
        ))}
      </Tabs>
      {render(current)}
    </>
  );
}

function BoardColumn({
  column,
  tasks,
  hasMore,
  loading,
  onLoadMore,
  showTitle,
}: {
  column: TaskBoardColumn;
  tasks: readonly Task[];
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  /** The title is the heading of the column on a desktop; a phone has it in the tab. */
  showTitle: boolean;
}) {
  const groupsSeveral = column.state_ids.length > 1;
  return (
    <Paper
      component="section"
      aria-label={column.name}
      variant="outlined"
      sx={{
        flex: { xs: '1 1 auto', md: '0 0 280px' },
        width: { xs: '100%', md: 280 },
        p: 1.5,
        bgcolor: 'action.hover',
        borderRadius: 2,
      }}
    >
      {showTitle ? (
        <Typography
          variant="subtitle2"
          component="h2"
          sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, overflowWrap: 'anywhere' }}
        >
          <Box
            component="span"
            aria-hidden
            sx={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              bgcolor: column.color,
              flexShrink: 0,
            }}
          />
          <Box component="span" sx={{ textTransform: 'uppercase' }}>
            {column.name}
          </Box>
          <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>
            {column.total}
          </Box>
        </Typography>
      ) : null}
      {tasks.length === 0 ? (
        <Box
          sx={{
            border: 2,
            borderStyle: 'dashed',
            borderColor: 'divider',
            borderRadius: 1.5,
            p: 2.5,
            textAlign: 'center',
            color: 'text.secondary',
          }}
        >
          Sin tareas
        </Box>
      ) : (
        <Stack component="ul" spacing={1.25} sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {tasks.map((task) => (
            <li key={task.id}>
              <BoardCard task={task} showState={groupsSeveral} />
            </li>
          ))}
        </Stack>
      )}
      {hasMore ? (
        <Button
          fullWidth
          variant="outlined"
          color="inherit"
          disabled={loading}
          onClick={onLoadMore}
          sx={{ mt: 1.5, minHeight: 44 }}
        >
          {loading ? 'Cargando…' : `Ver más (${column.total - tasks.length})`}
        </Button>
      ) : null}
    </Paper>
  );
}

/** The card is one link: the title carries it and stretches over the card, so the name of the link stays short. */
function BoardCard({ task, showState }: { task: Task; showState: boolean }) {
  const late = isOverdue(task);
  return (
    <Paper
      variant="outlined"
      sx={{
        position: 'relative',
        p: 1.5,
        '&:hover': { borderColor: 'primary.main' },
        '&:focus-within': { outline: 2, outlineColor: 'primary.main', outlineOffset: 2 },
      }}
    >
      <Link
        component={RouterLink}
        to={`/tareas/${task.id}`}
        underline="none"
        color="text.primary"
        sx={{
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: 4,
          overflow: 'hidden',
          overflowWrap: 'anywhere',
          fontWeight: 600,
          lineHeight: 1.35,
          mb: 1,
          '&::after': { content: '""', position: 'absolute', inset: 0 },
          '&:focus-visible': { outline: 'none' },
        }}
      >
        {task.title}
      </Link>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Chip size="small" label={task.task_type.name} sx={{ maxWidth: '55%' }} />
        <Typography
          variant="caption"
          sx={{
            color: late ? 'error.main' : 'text.secondary',
            fontWeight: late ? 600 : 400,
            textAlign: 'right',
          }}
        >
          {formatDay(task.due_date)}
          {late ? ' · vencida' : ''}
        </Typography>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 1.25, minWidth: 0 }}>
        <Avatar sx={{ width: 22, height: 22, fontSize: 10, bgcolor: 'primary.main' }}>
          {initials(task.assignee.name)}
        </Avatar>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ minWidth: 0, flex: 1 }}>
          {task.assignee.name}
        </Typography>
      </Stack>
      {showState ? (
        <Typography
          variant="caption"
          sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1, overflowWrap: 'anywhere' }}
        >
          <Box
            component="span"
            aria-hidden
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: task.state.color,
              flexShrink: 0,
            }}
          />
          {task.state.name}
        </Typography>
      ) : null}
    </Paper>
  );
}

function BoardSkeleton() {
  return (
    <Box
      aria-busy
      aria-label="Cargando el tablero"
      sx={{ display: 'flex', gap: 2, overflow: 'hidden' }}
    >
      {[0, 1, 2].map((key) => (
        <Skeleton key={key} variant="rounded" height={180} sx={{ flex: '0 0 280px' }} />
      ))}
    </Box>
  );
}

/** Up to two initials of a name, for the avatar. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}
