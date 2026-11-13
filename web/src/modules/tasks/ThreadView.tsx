import {
  Alert,
  Avatar,
  Box,
  Button,
  CircularProgress,
  LinearProgress,
  Link,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { splitMentions, fromWireBody, type Mentioned } from '@soltec/shared';
import { useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { problemMessage } from '../access/messages';
import { formatMoment } from '../access/formatting';
import { useCurrentUser } from '../access/SessionContext';
import { PhotoGallery } from '../files/PhotoGallery';
import { useFileImage } from '../files/useFiles';
import { CommentComposer } from './CommentComposer';
import { formatDay } from './dates';
import {
  useComment,
  useDeactivateComment,
  useEditComment,
  useThread,
  type ThreadEntry,
} from './useTasks';

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
const nameOf = (value: unknown): string => String(asRecord(value).name ?? '');
const dayOf = (value: unknown): string => (typeof value === 'string' ? formatDay(value) : '');

/** What an event of the thread says, in the words of the screen. */
export function describeEvent(entry: ThreadEntry): string {
  const author = entry.author.name;
  const data = asRecord(entry.event?.data);
  switch (entry.event?.type) {
    case 'created':
      return `${author} creó la tarea y se la asignó a ${nameOf(data.assignee)} para el ${dayOf(data.due_date)}.`;
    case 'state_changed': {
      const base = `${author} cambió el estado de «${nameOf(data.from)}» a «${nameOf(data.to)}».`;
      const reason =
        typeof data.reason === 'string' && data.reason ? ` Motivo: ${data.reason}` : '';
      const proposed =
        typeof data.proposed_due_date === 'string'
          ? ` Propone el ${dayOf(data.proposed_due_date)}.`
          : '';
      return base + reason + proposed;
    }
    case 'assignee_changed':
      return `${author} reasignó la tarea de ${nameOf(data.from)} a ${nameOf(data.to)}.`;
    case 'due_date_changed':
      return `${author} cambió el vencimiento del ${dayOf(data.from)} al ${dayOf(data.to)}.`;
    default:
      return `${author} hizo un cambio.`;
  }
}

/** A thumbnail of a comment's photo; touching it opens the gallery of that comment's photos. */
function Thumbnail({ fileId, onOpen }: { fileId: string; onOpen: () => void }) {
  const image = useFileImage(fileId, 'thumbnail');
  if (!image.url) {
    return (
      <Box
        sx={{
          width: 96,
          height: 96,
          display: 'flex',
          alignItems: image.isError ? 'center' : 'flex-end',
          justifyContent: 'center',
          overflow: 'hidden',
          bgcolor: 'action.hover',
          borderRadius: 1,
        }}
      >
        {image.isError ? (
          <Typography variant="caption">Sin foto</Typography>
        ) : (
          <LinearProgress aria-label="Cargando la foto" sx={{ width: 1, height: 4 }} />
        )}
      </Box>
    );
  }
  return (
    <Box
      component="button"
      type="button"
      aria-label="Ver la foto en grande"
      onClick={onOpen}
      sx={{
        p: 0,
        border: 0,
        bgcolor: 'transparent',
        cursor: 'zoom-in',
        borderRadius: 1,
        overflow: 'hidden',
        lineHeight: 0,
      }}
    >
      <Box
        component="img"
        src={image.url}
        alt="Foto adjunta"
        sx={{ width: 96, height: 96, objectFit: 'cover' }}
      />
    </Box>
  );
}

/** The photos of one comment. Each opens the gallery of this comment only, at the photo that was touched. */
function CommentPhotos({ fileIds }: { fileIds: readonly string[] }) {
  const [opened, setOpened] = useState<number | null>(null);
  return (
    <>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 1 }}>
        {fileIds.map((fileId, index) => (
          <Thumbnail key={fileId} fileId={fileId} onOpen={() => setOpened(index)} />
        ))}
      </Stack>
      {opened !== null ? (
        <PhotoGallery fileIds={fileIds} startIndex={opened} onClose={() => setOpened(null)} />
      ) : null}
    </>
  );
}

/** The text of a comment with each mention drawn as the person's name. */
function CommentBody({ entry }: { entry: ThreadEntry }) {
  if (!entry.body) {
    return null;
  }
  const names = new Map(entry.mentions.map((person) => [person.id, person.name]));
  return (
    <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
      {splitMentions(entry.body).map((segment, index) =>
        segment.kind === 'text' ? (
          segment.text
        ) : (
          <Box key={index} component="span" sx={{ color: 'primary.main', fontWeight: 600 }}>
            @{names.get(segment.id) ?? 'alguien'}
          </Box>
        ),
      )}
    </Typography>
  );
}

function Comment({ taskId, entry }: { taskId: string; entry: ThreadEntry }) {
  const me = useCurrentUser();
  const edit = useEditComment(taskId);
  const deactivate = useDeactivateComment(taskId);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const mine = me?.id === entry.author.id;
  const known: Mentioned[] = entry.mentions;

  if (editing) {
    const draft = fromWireBody(entry.body ?? '', known);
    return (
      <CommentComposer
        taskId={taskId}
        initialText={draft.text}
        initialMentions={draft.mentions}
        initialPhotos={entry.file_ids.map((id, index) => ({ id, name: `Foto ${index + 1}` }))}
        submitLabel="Guardar"
        onCancel={() => setEditing(false)}
        onSubmit={async ({ body, fileIds }) => {
          try {
            await edit.mutateAsync({
              entryId: entry.id,
              version: entry.version,
              body,
              file_ids: fileIds,
            });
            setEditing(false);
          } catch (error) {
            throw new Error(
              problemMessage(error, { forbidden: 'Solo quien lo escribió puede cambiarlo.' }),
            );
          }
        }}
      />
    );
  }

  return (
    <Stack
      direction="row"
      spacing={1.5}
      component="article"
      aria-label={`Comentario de ${entry.author.name}`}
    >
      <Avatar sx={{ width: 32, height: 32, fontSize: 14 }} aria-hidden>
        {entry.author.name.charAt(0).toUpperCase()}
      </Avatar>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" color="text.secondary">
          <strong>{entry.author.name}</strong> · {formatMoment(entry.created_at)}
          {entry.is_edited ? ' · editado' : ''}
        </Typography>
        <CommentBody entry={entry} />
        {entry.file_ids.length > 0 ? <CommentPhotos fileIds={entry.file_ids} /> : null}
        {failure ? (
          <Alert severity="error" sx={{ mt: 1 }}>
            {failure}
          </Alert>
        ) : null}
        {mine ? (
          <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
            {entry.body ? (
              <Link
                component="button"
                type="button"
                variant="body2"
                onClick={() => setEditing(true)}
              >
                Editar
              </Link>
            ) : null}
            <Link
              component="button"
              type="button"
              variant="body2"
              color="error"
              onClick={() => setRemoving(true)}
            >
              Quitar
            </Link>
          </Stack>
        ) : null}
      </Box>
      <ConfirmDialog
        open={removing}
        title="Quitar comentario"
        message="El comentario dejará de verse en el hilo. Su texto se conserva en el historial."
        confirmLabel="Quitar"
        destructive
        busy={deactivate.isPending}
        onConfirm={() => {
          setFailure(null);
          deactivate.mutate(entry.id, {
            onError: (error) => setFailure(problemMessage(error)),
            onSettled: () => setRemoving(false),
          });
        }}
        onCancel={() => setRemoving(false)}
      />
    </Stack>
  );
}

/** The activity thread of a task: its events and comments, newest first, with the composer on top. */
export function ThreadView({ taskId, canComment }: { taskId: string; canComment: boolean }) {
  const thread = useThread(taskId);
  const comment = useComment(taskId);
  const entries = thread.data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <Paper
      variant="outlined"
      sx={{ p: { xs: 2, md: 3 } }}
      component="section"
      aria-label="Actividad"
    >
      <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
        Actividad
      </Typography>
      {canComment ? (
        <Box sx={{ mb: 3 }}>
          <CommentComposer
            taskId={taskId}
            onSubmit={async ({ id, body, fileIds }) => {
              try {
                await comment.mutateAsync({ id, body, file_ids: fileIds });
              } catch (error) {
                throw new Error(
                  problemMessage(error, {
                    invalid_mention: 'Una de las personas mencionadas ya no puede ver esta tarea.',
                  }),
                );
              }
            }}
          />
        </Box>
      ) : null}
      {thread.isError ? <Alert severity="error">{problemMessage(thread.error)}</Alert> : null}
      {thread.isPending ? <CircularProgress aria-label="Cargando la actividad" /> : null}
      <Stack spacing={2} divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
        {entries.map((entry) =>
          entry.kind === 'event' ? (
            <Typography key={entry.id} variant="body2" color="text.secondary">
              {describeEvent(entry)} <span aria-hidden>·</span> {formatMoment(entry.created_at)}
            </Typography>
          ) : (
            <Comment key={entry.id} taskId={taskId} entry={entry} />
          ),
        )}
      </Stack>
      {thread.hasNextPage ? (
        <Button
          sx={{ mt: 2 }}
          onClick={() => void thread.fetchNextPage()}
          disabled={thread.isFetchingNextPage}
        >
          Ver anteriores
        </Button>
      ) : null}
    </Paper>
  );
}
