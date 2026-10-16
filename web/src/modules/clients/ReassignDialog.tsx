import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import type { components } from '@soltec/shared';
import { ApiError } from '@soltec/shared';
import { useEffect, useState } from 'react';
import { fieldMessage, problemMessage } from '../access/messages';
import { handoverSummary } from './handoverCopy';
import { PersonSelect, type Person } from './PersonSelect';
import { useReassignClient } from './useClients';

type Client = components['schemas']['Client'];

const FIELD_MESSAGES = { same_user: 'Elige a otra persona.' };

/** Replaces one adviser of a client with another person, with the people that belong only to this client. */
export function ReassignDialog({
  client,
  open,
  onClose,
  onDone,
}: {
  client: Client;
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const reassign = useReassignClient(client.id);
  const responsibleId = client.responsible?.id ?? client.sellers[0]?.user.id ?? '';
  const [fromId, setFromId] = useState(responsibleId);
  const [to, setTo] = useState<Person | null>(null);
  const [moveContacts, setMoveContacts] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFromId(responsibleId);
      setTo(null);
      setMoveContacts(true);
      setFieldErrors({});
      setFailure(null);
    }
  }, [open, responsibleId]);

  const submit = async () => {
    if (!to) {
      return;
    }
    setFieldErrors({});
    setFailure(null);
    try {
      const result = await reassign.mutateAsync({
        from_user_id: fromId,
        to_user_id: to.id,
        move_contacts: moveContacts,
      });
      onDone(handoverSummary(null, result));
      onClose();
    } catch (error) {
      const codes = error instanceof ApiError ? error.fieldErrors : {};
      if (Object.keys(codes).length > 0) {
        setFieldErrors(
          Object.fromEntries(
            Object.entries(codes).map(([field, code]) => [
              field,
              fieldMessage(code, FIELD_MESSAGES),
            ]),
          ),
        );
      } else {
        setFailure(problemMessage(error));
      }
    }
  };

  return (
    <Dialog
      open={open}
      onClose={reassign.isPending ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="reassign-title"
    >
      <DialogTitle id="reassign-title">Reasignar cliente</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <DialogContentText>
            El asesor que sale deja el cliente; el que entra queda en su lugar y es el responsable
            si el otro lo era.
          </DialogContentText>
          {failure ? <Alert severity="error">{failure}</Alert> : null}
          <TextField
            select
            label="Sale"
            value={fromId}
            onChange={(event) => setFromId(event.target.value)}
            error={Boolean(fieldErrors.from_user_id)}
            helperText={fieldErrors.from_user_id}
          >
            {client.sellers.map((seller) => (
              <MenuItem key={seller.user.id} value={seller.user.id}>
                {seller.user.name}
                {seller.is_responsible ? ' (responsable)' : ''}
              </MenuItem>
            ))}
          </TextField>
          <PersonSelect
            label="Entra"
            value={to}
            onChange={setTo}
            error={fieldErrors.to_user_id}
            required
            exclude={[fromId]}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={moveContacts}
                onChange={(event) => setMoveContacts(event.target.checked)}
              />
            }
            label="Pasar también los contactos de quien sale que pertenecen solo a este cliente."
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="inherit" onClick={onClose} disabled={reassign.isPending}>
          Cancelar
        </Button>
        <Button
          variant="contained"
          onClick={() => void submit()}
          disabled={reassign.isPending || !to}
        >
          Reasignar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
