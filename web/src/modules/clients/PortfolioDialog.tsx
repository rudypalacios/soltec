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
import { useClients, useReassignPortfolio } from './useClients';

const FIELD_MESSAGES = { same_user: 'Elige a otra persona.' };

/**
 * Hands the whole portfolio of an adviser to someone else, with the people that belong only to those clients. It is
 * a bulk move, so it takes two steps: choose the people, then a summary with the number of clients that will move and
 * a second confirmation. Nothing is sent before it.
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
  const [confirming, setConfirming] = useState(false);
  // The server moves what the caller reaches, inactive clients included, so the summary counts the same.
  const portfolio = useClients({
    seller_id: from?.id ?? '',
    status: 'all',
    page: 1,
    per_page: 1,
  });
  const count = confirming ? portfolio.data?.meta.total : undefined;

  useEffect(() => {
    if (open) {
      setConfirming(false);
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
      setConfirming(false);
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
      <DialogTitle id="portfolio-title">
        {confirming ? 'Confirmar la reasignación' : 'Reasignar cartera'}
      </DialogTitle>
      <DialogContent>
        {confirming && from && to ? (
          <Stack spacing={2} sx={{ pt: 1 }}>
            {failure ? <Alert severity="error">{failure}</Alert> : null}
            <DialogContentText color="text.primary">
              {count === undefined
                ? 'Contando los clientes…'
                : count === 0
                  ? `${from.name} no tiene clientes que tu alcance permita mover.`
                  : `Se reasignarán ${count === 1 ? '1 cliente' : `${count} clientes`} de ${from.name} a ${to.name}${moveContacts ? ', con los contactos que pertenecen solo a esos clientes' : ', sin sus contactos'}.`}
            </DialogContentText>
            <DialogContentText>
              {to.name} será la persona responsable donde lo era {from.name}. ¿Seguro que quieres
              continuar?
            </DialogContentText>
          </Stack>
        ) : (
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
        )}
      </DialogContent>
      <DialogActions>
        <Button
          variant="outlined"
          color="inherit"
          onClick={confirming ? () => setConfirming(false) : onClose}
          disabled={reassign.isPending}
        >
          {confirming ? 'Volver' : 'Cancelar'}
        </Button>
        {confirming ? (
          <Button
            variant="contained"
            onClick={() => void submit()}
            disabled={reassign.isPending || !count}
          >
            Sí, reasignar
          </Button>
        ) : (
          <Button variant="contained" onClick={() => setConfirming(true)} disabled={!from || !to}>
            Continuar
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
