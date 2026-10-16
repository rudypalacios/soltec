import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
} from '@mui/material';
import type { components } from '@soltec/shared';
import { ApiError } from '@soltec/shared';
import { useEffect, useState } from 'react';
import { fieldMessage, problemMessage } from '../access/messages';
import { PersonSelect, type Person } from './PersonSelect';
import { useAddSeller } from './useClients';

type Client = components['schemas']['Client'];

/** Shares a customer with one more adviser. The button confirms: nothing is sent before it. */
export function AddSellerDialog({
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
  const add = useAddSeller(client.id);
  const [person, setPerson] = useState<Person | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPerson(null);
      setError(undefined);
      setFailure(null);
    }
  }, [open]);

  const submit = async () => {
    if (!person) {
      return;
    }
    setError(undefined);
    setFailure(null);
    try {
      await add.mutateAsync(person.id);
      onDone(`«${person.name}» es ahora asesor de «${client.name}».`);
      onClose();
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.fieldErrors.user_id : undefined;
      if (code) {
        setError(fieldMessage(code));
      } else {
        setFailure(problemMessage(caught));
      }
    }
  };

  return (
    <Dialog
      open={open}
      onClose={add.isPending ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="add-seller-title"
    >
      <DialogTitle id="add-seller-title">Agregar asesor</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <DialogContentText>
            El cliente aparecerá en la lista de la persona que elijas. Sus contactos siguen siendo
            suyos: vincular un cliente no los comparte.
          </DialogContentText>
          {failure ? <Alert severity="error">{failure}</Alert> : null}
          <PersonSelect
            label="Asesor"
            value={person}
            onChange={setPerson}
            error={error}
            required
            exclude={client.sellers.map((seller) => seller.user.id)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="inherit" onClick={onClose} disabled={add.isPending}>
          Cancelar
        </Button>
        <Button
          variant="contained"
          onClick={() => void submit()}
          disabled={add.isPending || !person}
        >
          Agregar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
