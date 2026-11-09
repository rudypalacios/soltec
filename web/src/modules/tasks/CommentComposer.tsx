import {
  Alert,
  Box,
  Button,
  Chip,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  insertMention,
  mentionQueryAt,
  newUuidV7,
  toWireBody,
  type Mentioned,
} from '@soltec/shared';
import { useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { PhotoUploader, type UploadedPhoto } from '../files/PhotoUploader';
import { useMentionOptions } from './useTasks';

const MAX_PHOTOS = 5;

export interface ComposerResult {
  /** The id of the comment, chosen here and kept for retries. */
  id: string;
  /** The text with each mention written as `@[id]`. */
  body: string;
  fileIds: string[];
}

/**
 * Writes a comment. Typing `@` opens the list of people who can see the task, filtered by what follows (as in Jira or an
 * email's «Para»); choosing one writes `@Name` in the text and adds the person to the «Menciona a» row, where they can
 * be removed. The text goes out with `@[id]` marks (shared `toWireBody`), so a renamed person still reads right.
 */
export function CommentComposer({
  taskId,
  initialText = '',
  initialMentions = [],
  initialPhotos = [],
  submitLabel = 'Comentar',
  withPhotos = true,
  onSubmit,
  onCancel,
}: {
  taskId: string;
  initialText?: string;
  initialMentions?: readonly Mentioned[];
  /** The photos a comment that is edited already has; the person can remove them and add others. */
  initialPhotos?: readonly UploadedPhoto[];
  submitLabel?: string;
  withPhotos?: boolean;
  /** Resolves when the comment is saved; a rejection leaves the text for the person to retry. */
  onSubmit: (result: ComposerResult) => Promise<void>;
  onCancel?: () => void;
}) {
  const [text, setText] = useState(initialText);
  const [caret, setCaret] = useState(initialText.length);
  const [chosen, setChosen] = useState<Mentioned[]>([...initialMentions]);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([...initialPhotos]);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);

  const typing = mentionQueryAt(text, caret);
  const open = typing !== null && typing.start !== dismissedAt;
  const options = useMentionOptions(taskId, typing?.query ?? '', open);
  const choices = open ? (options.data?.data ?? []) : [];
  const listOpen = open && choices.length > 0;

  const track = (target: HTMLTextAreaElement) => {
    // Selection events that arrive while the field is not focused (a click on the list) say nothing about typing.
    if (document.activeElement === target) {
      setCaret(target.selectionStart);
    }
  };

  const change = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setText(event.target.value);
    track(event.target);
    setActive(0);
    setDismissedAt(null);
  };

  const choose = (person: Mentioned) => {
    if (!typing) {
      return;
    }
    // The end of what was typed comes from the text, not from the caret: a click on the list can move the caret.
    const end = typing.start + 1 + typing.query.length;
    const next = insertMention(text, typing.start, end, person.name);
    setText(next.text);
    setCaret(next.caret);
    setChosen((current) =>
      current.some((item) => item.id === person.id) ? current : [...current, person],
    );
    setActive(0);
    // The caret moves after React has put the new text in the field.
    requestAnimationFrame(() => {
      field.current?.focus();
      field.current?.setSelectionRange(next.caret, next.caret);
    });
  };

  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!listOpen) {
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (current + step + choices.length) % choices.length);
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      const person = choices[active];
      if (person) {
        choose(person);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setDismissedAt(typing?.start ?? null);
    }
  };

  const removeMention = (person: Mentioned) => {
    setChosen((current) => current.filter((item) => item.id !== person.id));
    setText((current) => current.split(`@${person.name}`).join('').replace(/ {2,}/g, ' '));
  };

  // One id per comment being written, kept for retries, so a lost answer never stores it twice.
  const [draftId, setDraftId] = useState(() => newUuidV7());
  const wire = toWireBody(text.trim(), chosen);
  const canSend = (wire.body !== '' || photos.length > 0) && !busy;

  const send = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await onSubmit({
        id: draftId,
        body: wire.body,
        fileIds: photos.map((photo) => photo.id),
      });
      setText('');
      setCaret(0);
      setChosen([]);
      setPhotos([]);
      setDraftId(newUuidV7());
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'No se pudo enviar el comentario.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={1.5} onKeyDown={keys}>
      {failure ? <Alert severity="error">{failure}</Alert> : null}
      <Box sx={{ position: 'relative' }}>
        <TextField
          inputRef={field}
          label="Escribe un comentario"
          value={text}
          onChange={change}
          onSelect={(event) => track(event.target as HTMLTextAreaElement)}
          multiline
          minRows={2}
          maxRows={8}
          fullWidth
          helperText="Escribe @ para mencionar a alguien."
          slotProps={{
            htmlInput: {
              maxLength: 5000,
              role: 'combobox',
              'aria-expanded': listOpen,
              'aria-autocomplete': 'list',
            },
          }}
        />
        {listOpen ? (
          <Paper
            elevation={4}
            sx={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: '100%',
              zIndex: 2,
              mb: 0.5,
              maxHeight: 280,
              overflow: 'auto',
            }}
          >
            <List role="listbox" aria-label="Personas que puedes mencionar" disablePadding>
              {choices.map((person, index) => (
                <ListItemButton
                  key={person.id}
                  role="option"
                  aria-selected={index === active}
                  selected={index === active}
                  sx={{ minHeight: 44 }}
                  // The click must not take the focus from the field, or the caret is lost.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(person)}
                >
                  <ListItemText primary={person.name} />
                </ListItemButton>
              ))}
            </List>
          </Paper>
        ) : null}
      </Box>

      {chosen.length > 0 ? (
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{ flexWrap: 'wrap', alignItems: 'center' }}
        >
          <Typography variant="body2" color="text.secondary">
            Menciona a:
          </Typography>
          {chosen.map((person) => (
            <Chip
              key={person.id}
              label={person.name}
              size="small"
              onDelete={() => removeMention(person)}
              deleteIcon={<span aria-label={`Quitar a ${person.name}`}>✕</span>}
            />
          ))}
        </Stack>
      ) : null}

      {withPhotos ? <PhotoUploader value={photos} onChange={setPhotos} max={MAX_PHOTOS} /> : null}

      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
        {onCancel ? (
          <Button color="inherit" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
        ) : null}
        <Button variant="contained" onClick={() => void send()} disabled={!canSend}>
          {submitLabel}
        </Button>
      </Stack>
    </Stack>
  );
}
