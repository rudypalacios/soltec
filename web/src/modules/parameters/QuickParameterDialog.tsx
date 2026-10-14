import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
} from '@mui/material';
import { useEffect, useState, type FormEvent } from 'react';
import { fieldMessages, problemMessage } from '../access/messages';
import type { ParameterView } from './parameterViews';
import { useSaveParameterValue } from './useParameters';

interface Choice {
  id: string;
  name: string;
}

/**
 * Creates a value of a catalog list without leaving the form that needs it (a contact type in a supplier, a brand or a
 * group in a product). It calls the same route as the list's own section, so it answers 403 without that section's
 * `create`; the form only offers it to whoever has that permission (ADR-0024). A list whose values belong to a parent
 * (a group belongs to an area) asks for it too, chosen among `parents`.
 */
export function QuickParameterDialog({
  view,
  open,
  onClose,
  onCreated,
  parents,
  initialName = '',
}: {
  view: ParameterView;
  open: boolean;
  onClose: () => void;
  onCreated: (created: Choice) => void;
  /** The values to choose the parent among, for a list that has one. */
  parents?: Choice[];
  /** The name to start with, when the person already typed it to search (the «Crear "…"» option). */
  initialName?: string;
}) {
  const save = useSaveParameterValue(view);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const parentField = view.parent?.field;

  // Each time it opens it starts from what was typed, with no leftovers of the previous attempt.
  useEffect(() => {
    if (open) {
      setName(initialName);
      setErrors({});
      setFailure(null);
    }
  }, [open, initialName]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    // The dialog is rendered inside the form that opened it: its submit must not save that form too.
    event.stopPropagation();
    setErrors({});
    setFailure(null);
    try {
      const created = await save.mutateAsync({
        name: name.trim(),
        ...(parentField ? { parentId } : {}),
      });
      setName('');
      onCreated({ id: created.id, name: created.name });
    } catch (error) {
      const fields = fieldMessages(error, { name: { taken: view.takenMessage } });
      setErrors(fields);
      setFailure(Object.keys(fields).length === 0 ? problemMessage(error) : null);
    }
  };

  return (
    <Dialog open={open} onClose={save.isPending ? undefined : onClose} fullWidth maxWidth="xs">
      <form onSubmit={(event) => void submit(event)} noValidate>
        <DialogTitle>{view.newLabel}</DialogTitle>
        <DialogContent>
          {failure ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {failure}
            </Alert>
          ) : null}
          {view.parent && parentField ? (
            <TextField
              select
              label={view.parent.label}
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
              error={Boolean(errors[parentField])}
              helperText={errors[parentField]}
              margin="dense"
              required
              fullWidth
            >
              {(parents ?? []).map((parent) => (
                <MenuItem key={parent.id} value={parent.id}>
                  {parent.name}
                </MenuItem>
              ))}
            </TextField>
          ) : null}
          <TextField
            label="Nombre"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={Boolean(errors.name)}
            helperText={errors.name}
            slotProps={{ htmlInput: { maxLength: view.nameMax } }}
            margin="dense"
            autoFocus
            required
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" color="inherit" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={save.isPending || !name.trim() || (parentField !== undefined && !parentId)}
          >
            Crear
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
