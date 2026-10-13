import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';
import { useState, type FormEvent } from 'react';
import { fieldMessages, problemMessage } from '../access/messages';
import { viewOf } from '../parameters/parameterViews';
import { useSaveParameterValue } from '../parameters/useParameters';

const VIEW = viewOf('contact-types');

/**
 * Creates a contact type without leaving the supplier form. It calls the same route as the section itself, so it
 * answers 403 without `contact_types.create`; the form only offers it to whoever has that permission (ADR-0024).
 */
export function QuickContactType({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (type: { id: string; name: string }) => void;
}) {
  const save = useSaveParameterValue(VIEW);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    // Not the supplier form's own submit: this one sits in a dialog that React renders inside that form's tree.
    event.stopPropagation();
    setNameError(null);
    setFailure(null);
    try {
      const created = await save.mutateAsync({ name: name.trim() });
      setName('');
      onCreated({ id: created.id, name: created.name });
    } catch (error) {
      const fields = fieldMessages(error, { name: { taken: VIEW.takenMessage } });
      setNameError(fields.name ?? null);
      setFailure(fields.name ? null : problemMessage(error));
    }
  };

  return (
    <Dialog open={open} onClose={save.isPending ? undefined : onClose} fullWidth maxWidth="xs">
      <form onSubmit={(event) => void submit(event)} noValidate>
        <DialogTitle>Nuevo tipo de contacto</DialogTitle>
        <DialogContent>
          {failure ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {failure}
            </Alert>
          ) : null}
          <TextField
            label="Nombre"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={nameError !== null}
            helperText={nameError}
            slotProps={{ htmlInput: { maxLength: VIEW.nameMax } }}
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
          <Button type="submit" variant="contained" disabled={save.isPending || !name.trim()}>
            Crear
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
