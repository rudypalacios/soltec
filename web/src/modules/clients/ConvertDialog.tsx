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
import type { IdentificationType } from '../../components/identification';
import { fieldMessage, problemMessage } from '../access/messages';
import { billingBody, emptyBilling, type BillingDraft } from './clientDrafts';
import { BillingFields, FIELD_MESSAGES, IdentificationFields } from './clientFields';
import { useConvertClient } from './useClients';

type Client = components['schemas']['Client'];

const CONVERT_ERRORS = {
  identification_taken:
    'Ya existe un cliente con esta identificación. Consulta con tu jefe directo o con administración.',
  identification_inactive:
    'Ya existe un cliente desactivado con esta identificación. Pide que lo reactiven en lugar de registrarlo de nuevo.',
  conflict: 'Otra persona cambió este cliente mientras lo convertías. Recarga la página.',
};

/**
 * Turns a prospect into a customer: asks for the identification (a kind is required, «Sin identificación» is one) and
 * the billing profile. The button says what it does and nothing is sent before it; it cannot be undone.
 */
export function ConvertDialog({
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
  const convert = useConvertClient(client.id);
  const [type, setType] = useState<IdentificationType>(client.identification_type);
  const [identification, setIdentification] = useState(client.identification ?? '');
  const [billing, setBilling] = useState<BillingDraft>(emptyBilling);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setType(client.identification_type);
      setIdentification(client.identification ?? '');
      setBilling(emptyBilling());
      setErrors({});
      setFailure(null);
    }
  }, [open, client.identification_type, client.identification]);

  const submit = async () => {
    setErrors({});
    setFailure(null);
    try {
      await convert.mutateAsync({
        version: client.version,
        identification_type: type,
        identification: type === 'none' ? null : identification.trim() || null,
        billing_profile: billingBody(billing),
      });
      onDone(`«${client.name}» ahora es un cliente de venta.`);
      onClose();
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.code === 'identification_taken' || error.code === 'identification_inactive')
      ) {
        setErrors({ identification: problemMessage(error, CONVERT_ERRORS) });
        return;
      }
      const codes = error instanceof ApiError ? error.fieldErrors : {};
      const messages = Object.fromEntries(
        Object.entries(codes).map(([field, code]) => [
          field,
          fieldMessage(code, FIELD_MESSAGES[field.split('.').at(-1) ?? field] ?? {}),
        ]),
      );
      setErrors(messages);
      setFailure(Object.keys(messages).length === 0 ? problemMessage(error, CONVERT_ERRORS) : null);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={convert.isPending ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="convert-title"
    >
      <DialogTitle id="convert-title">Convertir en cliente de venta</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <DialogContentText>
            «{client.name}» pasa de prospecto a cliente de venta. Hace falta su identificación
            (puede ser «Sin identificación», que se factura como consumidor final) y sus datos de
            facturación. No se puede deshacer.
          </DialogContentText>
          {failure ? <Alert severity="error">{failure}</Alert> : null}
          <IdentificationFields
            type={type}
            value={identification}
            onType={setType}
            onValue={setIdentification}
            error={errors.identification}
            required
          />
          <BillingFields
            draft={billing}
            onChange={(changes) => setBilling((current) => ({ ...current, ...changes }))}
            errors={errors}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="inherit" onClick={onClose} disabled={convert.isPending}>
          Cancelar
        </Button>
        <Button
          variant="contained"
          onClick={() => void submit()}
          disabled={convert.isPending || !billing.legalName.trim() || !billing.taxRegimeId}
        >
          Convertir en cliente
        </Button>
      </DialogActions>
    </Dialog>
  );
}
