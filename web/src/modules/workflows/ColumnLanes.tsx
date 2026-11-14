import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { Box, Stack, TextField } from '@mui/material';
import { NEW_COLUMN, type ColumnDraft, type NameProblem } from '@soltec/shared';
import { useState } from 'react';
import { ColoredName } from './ColoredName';
import type { ColumnsEditorProps } from './columnsEditor';

const PROBLEM_TEXT: Record<NameProblem, string> = {
  empty: 'Escribe un nombre.',
  duplicate: 'Otra columna ya tiene ese nombre.',
};

const columnId = (key: string) => `column:${key}`;
const stateDragId = (id: string) => `state:${id}`;
const NEW_LANE_ID = 'lane:new';

type DragData =
  { type: 'column'; key: string } | { type: 'state'; stateId: string } | { type: 'new' };

/** A column is dropped among columns only; a state is dropped on whatever lane the pointer is over. */
const collide: CollisionDetection = (args) => {
  const data = args.active.data.current as DragData | undefined;
  if (data?.type === 'column') {
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (container) => (container.data.current as DragData | undefined)?.type === 'column',
      ),
    });
  }
  const within = pointerWithin(args);
  return within.length > 0 ? within : closestCenter(args);
};

/**
 * The columns as lanes side by side: drag a lane by its handle to order it, and drag a state by its handle to another
 * lane to group it there, or to «Nueva columna» to give it a column of its own. The keyboard does the same (Space to
 * pick up, arrows to move, Space to drop). It is the editor of a desktop; a phone uses `ColumnList`.
 */
export function ColumnLanes({
  drafts,
  problems,
  statesById,
  disabled,
  onRename,
  onMoveColumn,
  onMoveState,
}: ColumnsEditorProps) {
  const [dragging, setDragging] = useState<DragData | null>(null);
  const sensors = useSensors(
    // A few pixels before a press becomes a drag, so a click on the handle or the name does not start one.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const labelOf = (id: string | number): string => {
    const text = String(id);
    if (text.startsWith('column:')) {
      return `la columna «${drafts.find((draft) => columnId(draft.key) === text)?.name ?? ''}»`;
    }
    if (text.startsWith('state:')) {
      return `el estado «${statesById.get(text.slice(6))?.name ?? ''}»`;
    }
    return 'Nueva columna';
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Tomaste ${labelOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${labelOf(active.id)} está sobre ${labelOf(over.id)}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `Soltaste ${labelOf(active.id)} sobre ${labelOf(over.id)}.`
        : `Soltaste ${labelOf(active.id)}.`,
    onDragCancel: ({ active }) => `Cancelaste el movimiento de ${labelOf(active.id)}.`,
  };

  const onDragStart = (event: DragStartEvent) =>
    setDragging((event.active.data.current as DragData | undefined) ?? null);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    const from = active.data.current as DragData | undefined;
    const to = over?.data.current as DragData | undefined;
    if (!from || !to) {
      return;
    }
    if (from.type === 'column' && to.type === 'column') {
      const fromKey = from.key;
      const toKey = to.key;
      onMoveColumn(
        drafts.findIndex((draft) => draft.key === fromKey),
        drafts.findIndex((draft) => draft.key === toKey),
      );
    } else if (from.type === 'state') {
      if (to.type === 'column') {
        onMoveState(from.stateId, to.key);
      } else if (to.type === 'new') {
        onMoveState(from.stateId, NEW_COLUMN);
      }
    }
  };

  const draggedState = dragging?.type === 'state' ? statesById.get(dragging.stateId) : undefined;
  const draggedColumn =
    dragging?.type === 'column' ? drafts.find((draft) => draft.key === dragging.key) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collide}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'Para tomar un elemento pulsa Espacio, muévelo con las flechas y pulsa Espacio para soltarlo, o Escape para cancelar.',
        },
      }}
    >
      <SortableContext
        items={drafts.map((draft) => columnId(draft.key))}
        strategy={horizontalListSortingStrategy}
      >
        <Box
          component="ul"
          aria-label="Columnas del tablero"
          sx={{
            listStyle: 'none',
            m: 0,
            p: 0,
            display: 'flex',
            gap: 1.5,
            alignItems: 'flex-start',
            overflowX: 'auto',
            pb: 1,
          }}
        >
          {drafts.map((draft, index) => (
            <Lane
              key={draft.key}
              draft={draft}
              problem={problems[index] ?? null}
              statesById={statesById}
              disabled={disabled}
              draggingState={dragging?.type === 'state'}
              draggedStateId={dragging?.type === 'state' ? dragging.stateId : null}
              onRename={onRename}
            />
          ))}
          <NewLane visible={dragging?.type !== 'column'} />
        </Box>
      </SortableContext>
      <DragOverlay>
        {draggedState ? (
          <Chip state={draggedState} lifted />
        ) : draggedColumn ? (
          <Box
            sx={{
              width: 200,
              p: 1.25,
              borderRadius: 2,
              bgcolor: 'background.paper',
              border: 1,
              borderColor: 'primary.main',
              boxShadow: 6,
              fontWeight: 600,
            }}
          >
            {draggedColumn.name}
          </Box>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Lane({
  draft,
  problem,
  statesById,
  disabled,
  draggingState,
  draggedStateId,
  onRename,
}: {
  draft: ColumnDraft;
  problem: NameProblem | null;
  statesById: ColumnsEditorProps['statesById'];
  disabled: boolean;
  draggingState: boolean;
  draggedStateId: string | null;
  onRename: (key: string, name: string) => void;
}) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: columnId(draft.key), data: { type: 'column', key: draft.key }, disabled });
  const receiving = draggingState && isOver;

  return (
    <Box
      component="li"
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      sx={{
        flex: '0 0 200px',
        boxSizing: 'border-box',
        p: 1.25,
        borderRadius: 2,
        border: 2,
        borderColor: receiving ? 'primary.main' : 'divider',
        bgcolor: receiving ? 'primary.tint' : 'action.hover',
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'flex-start' }}>
          <Handle
            label={`Arrastrar la columna «${draft.name}»`}
            setActivatorNodeRef={setActivatorNodeRef}
            attributes={attributes}
            listeners={listeners}
            disabled={disabled}
          />
          <TextField
            variant="standard"
            value={draft.name}
            onChange={(event) => onRename(draft.key, event.target.value)}
            error={problem !== null}
            helperText={problem ? PROBLEM_TEXT[problem] : null}
            disabled={disabled}
            slotProps={{
              htmlInput: { 'aria-label': 'Nombre de la columna', maxLength: 100 },
            }}
            sx={{ flex: 1, minWidth: 0, mt: 0.5, '& input': { fontWeight: 600 } }}
          />
        </Stack>
        <Stack component="ul" spacing={1} sx={{ listStyle: 'none', m: 0, p: 0, minHeight: 44 }}>
          {draft.stateIds.map((stateId) => {
            const state = statesById.get(stateId);
            return state ? (
              <li key={stateId}>
                <DraggableChip
                  state={state}
                  hidden={draggedStateId === stateId}
                  disabled={disabled}
                />
              </li>
            ) : null;
          })}
        </Stack>
      </Stack>
    </Box>
  );
}

function DraggableChip({
  state,
  hidden,
  disabled,
}: {
  state: { id: string; name: string; color: string };
  hidden: boolean;
  disabled: boolean;
}) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners } = useDraggable({
    id: stateDragId(state.id),
    data: { type: 'state', stateId: state.id },
    disabled,
  });
  return (
    <Chip
      state={state}
      hidden={hidden}
      innerRef={setNodeRef}
      handle={
        <Handle
          label={`Arrastrar el estado «${state.name}»`}
          setActivatorNodeRef={setActivatorNodeRef}
          attributes={attributes}
          listeners={listeners}
          disabled={disabled}
        />
      }
    />
  );
}

/** The card of a state: its handle, its color and its name. While it is dragged the lane keeps a faint place for it. */
function Chip({
  state,
  handle,
  innerRef,
  hidden = false,
  lifted = false,
}: {
  state: { name: string; color: string };
  handle?: React.ReactNode;
  innerRef?: (node: HTMLElement | null) => void;
  hidden?: boolean;
  lifted?: boolean;
}) {
  return (
    <Box
      ref={innerRef}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        minHeight: 44,
        pr: 1,
        borderRadius: 1.5,
        border: 1,
        borderColor: lifted ? 'primary.main' : 'divider',
        bgcolor: 'background.paper',
        boxShadow: lifted ? 6 : 0,
        opacity: hidden ? 0.35 : 1,
        overflowWrap: 'anywhere',
      }}
    >
      {handle ?? <DragIndicatorIcon fontSize="small" sx={{ mx: 0.5, color: 'text.disabled' }} />}
      <ColoredName state={state} />
    </Box>
  );
}

function Handle({
  label,
  setActivatorNodeRef,
  attributes,
  listeners,
  disabled,
}: {
  label: string;
  setActivatorNodeRef: (node: HTMLElement | null) => void;
  attributes: object;
  listeners: object | undefined;
  disabled: boolean;
}) {
  return (
    <Box
      component="button"
      type="button"
      ref={setActivatorNodeRef}
      aria-label={label}
      disabled={disabled}
      {...attributes}
      {...listeners}
      sx={{
        flex: 'none',
        width: 28,
        minHeight: 44,
        p: 0,
        border: 0,
        bgcolor: 'transparent',
        color: 'text.secondary',
        display: 'grid',
        placeItems: 'center',
        cursor: 'grab',
        touchAction: 'none',
        '&:focus-visible': { outline: 2, outlineColor: 'primary.main', borderRadius: 1 },
      }}
    >
      <DragIndicatorIcon fontSize="small" />
    </Box>
  );
}

/** Where a state is dropped to give it a column of its own. */
function NewLane({ visible }: { visible: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: NEW_LANE_ID, data: { type: 'new' } });
  if (!visible) {
    return null;
  }
  return (
    <Box
      component="li"
      ref={setNodeRef}
      sx={{
        flex: '0 0 200px',
        boxSizing: 'border-box',
        minHeight: 140,
        p: 2,
        display: 'grid',
        placeItems: 'center',
        textAlign: 'center',
        borderRadius: 2,
        border: 2,
        borderStyle: 'dashed',
        borderColor: isOver ? 'primary.main' : 'text.disabled',
        bgcolor: isOver ? 'primary.tint' : 'transparent',
        color: 'text.secondary',
      }}
    >
      Suelta aquí un estado para crear una columna nueva
    </Box>
  );
}
