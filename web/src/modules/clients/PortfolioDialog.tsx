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
  Stack,
} from '@mui/material';
import { ApiError } from '@soltec/shared';
import { useEffect, useState } from 'react';
import { fieldMessage, problemMessage } from '../access/messages';
import { handoverSummary } from './handoverCopy';
import { PersonSelect, type Person } from './PersonSelect';
import { useReassignPortfolio } from './useClients';

const FIELD_MESSAGES = { same_user: 'Elige a otra persona.' };

/**
 * Hands the whole portfolio of an adviser to someone else, with the people that belong only to those clients. The
 * button confirms: it says what is about to happen and nothing is sent before it.
 */
export function PortfolioDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const reassign = useReassignPortfolio();
  const [from, setFrom] = useState<Person | null>(null);
  const [to, setTo] = useState<Person | null>(null);
  const [moveContacts, setMoveContacts] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFrom(null);
      setTo(null);
      setMoveContacts(true);
      setFieldErrors({});
      setFailure(null);
    }
  }, [open]);

  const submit = async () => {
    if (!from || !to) {
      return;
    }
    setFieldErrors({});
    setFailure(null);
    try {
      const result = await reassign.mutateAsync({
        from_user_id: from.id,
        to_user_id: to.id,
        move_contacts: moveContacts,
      });
      onDone(handoverSummary(result.clients_reassigned, result));
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
      aria-labelledby="portfolio-title"
    >
      <DialogTitle id="portfolio-title">Reasignar cartera</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <DialogContentText>
            Todos los clientes de la primera persona pasan a la segunda, y esta es la responsable
            donde lo era la otra. Solo se mueven los que tu alcance permite ver.
          </DialogContentText>
          {failure ? <Alert severity="error">{failure}</Alert> : null}
          <PersonSelect
            label="Entregar la cartera de"
            value={from}
            onChange={setFrom}
            error={fieldErrors.from_user_id}
            required
          />
          <PersonSelect
            label="A"
            value={to}
            onChange={setTo}
            error={fieldErrors.to_user_id}
            required
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={moveContacts}
                onChange={(event) => setMoveContacts(event.target.checked)}
              />
            }
            label="Pasar también los contactos que pertenecen solo a esos clientes."
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
          disabled={reassign.isPending || !from || !to}
        >
          Entregar cartera
        </Button>
      </DialogActions>
    </Dialog>
  );
}
