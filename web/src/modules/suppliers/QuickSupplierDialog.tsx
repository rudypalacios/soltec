import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  MenuItem,
  TextField,
} from '@mui/material';
import { ApiError } from '@soltec/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { fieldMessages, problemMessage } from '../access/messages';
import { IDENTIFICATION_LABELS, type IdentificationType } from '../../components/identification';
import { useCreateSupplier } from './useSuppliers';

const FIELD_MESSAGES = {
  identification: {
    invalid: 'No es un NIT o CUI válido. Revisa el número y el dígito verificador.',
    not_applicable: 'Sin identificación no lleva número.',
  },
};

/**
 * Registers a supplier with what a product needs (name and identification) without leaving the form that asked for
 * it. Addresses, people and credit are completed later in Proveedores. It calls the same route as that section, so
 * it answers 403 without `suppliers.create`, and the form only offers it to whoever has it (ADR-0024). The NIT rules
 * are the server's (ADR-0022): a taken one never says whose, and a deactivated one is reactivated from Proveedores.
 */
export function QuickSupplierDialog({
  open,
  initialName = '',
  onClose,
  onCreated,
}: {
  open: boolean;
  initialName?: string;
  onClose: () => void;
  onCreated: (created: { id: string; name: string }) => void;
}) {
  const create = useCreateSupplier();
  const [name, setName] = useState('');
  const [type, setType] = useState<IdentificationType>('nit');
  const [identification, setIdentification] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setType('nit');
      setIdentification('');
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
      const created = await create.mutateAsync({
        name: name.trim(),
        identification_type: type,
        identification: type === 'none' ? null : identification.trim(),
      });
      onCreated({ id: created.id, name: created.name });
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.code === 'identification_taken' || error.code === 'identification_inactive')
      ) {
        const holder = error.details.inactive_supplier_name;
        setErrors({
          identification: `${problemMessage(error)}${typeof holder === 'string' ? ` Es «${holder}».` : ''}`,
        });
        return;
      }
      const fields = fieldMessages(error, FIELD_MESSAGES);
      setErrors(fields);
      setFailure(Object.keys(fields).length === 0 ? problemMessage(error) : null);
    }
  };

  const ready = name.trim() !== '' && (type === 'none' || identification.trim() !== '');

  return (
    <Dialog open={open} onClose={create.isPending ? undefined : onClose} fullWidth maxWidth="xs">
      <form onSubmit={(event) => void submit(event)} noValidate>
        <DialogTitle>Nuevo proveedor</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 1 }}>
            Solo lo necesario para usarlo ahora. Las direcciones, los contactos y el crédito se
            completan después en Proveedores.
          </DialogContentText>
          {failure ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {failure}
            </Alert>
          ) : null}
          <TextField
            label="Nombre"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={Boolean(errors.name)}
            helperText={errors.name}
            slotProps={{ htmlInput: { maxLength: 190 } }}
            margin="dense"
            autoFocus
            required
            fullWidth
          />
          <TextField
            select
            label="Identificación"
            value={type}
            onChange={(event) => setType(event.target.value as IdentificationType)}
            margin="dense"
            fullWidth
          >
            {(Object.keys(IDENTIFICATION_LABELS) as IdentificationType[]).map((option) => (
              <MenuItem key={option} value={option}>
                {IDENTIFICATION_LABELS[option]}
              </MenuItem>
            ))}
          </TextField>
          {type === 'none' ? null : (
            <TextField
              label={type === 'nit' ? 'Número de NIT' : 'Número de CUI'}
              value={identification}
              onChange={(event) => setIdentification(event.target.value)}
              error={Boolean(errors.identification)}
              helperText={errors.identification}
              slotProps={{ htmlInput: { maxLength: 30 } }}
              margin="dense"
              required
              fullWidth
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" color="inherit" onClick={onClose} disabled={create.isPending}>
            Cancelar
          </Button>
          <Button type="submit" variant="contained" disabled={create.isPending || !ready}>
            Crear
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
