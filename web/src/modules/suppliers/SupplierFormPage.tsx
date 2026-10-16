import {
  Alert,
  Button,
  CircularProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { ApiError } from '@soltec/shared';
import type { components } from '@soltec/shared';
import { useState, type FormEvent } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { FormActions, FormPage } from '../../components/FormPage';
import { PageHeader } from '../../components/PageHeader';
import { fieldMessage, problemMessage } from '../access/messages';
import { useCan } from '../access/SessionContext';
import { IDENTIFICATION_LABELS, type IdentificationType } from '../../components/identification';
import { AddressesEditor } from '../../components/AddressesEditor';
import { ContactsEditor } from './SupplierRows';
import { bodyOf, draftOf, type SupplierDraft } from './supplierDrafts';
import {
  useCreateSupplier,
  useSetSupplierActive,
  useSupplier,
  useUpdateSupplier,
} from './useSuppliers';

type Supplier = components['schemas']['Supplier'];

const FIELD_MESSAGES: Record<string, Record<string, string>> = {
  identification: {
    invalid: 'No es un NIT o CUI válido. Revisa el número y el dígito verificador.',
    not_applicable: 'Sin identificación no lleva número.',
  },
  credit_days: {
    out_of_range: 'Escribe un número de días entre 0 y 65 535.',
    invalid: 'Escribe un número entero de días.',
  },
  credit_limit: { invalid: 'Escribe un monto con hasta dos decimales, por ejemplo 15000.50.' },
  email: { invalid: 'Escribe un correo válido, por ejemplo nombre@empresa.com.' },
  is_primary: { duplicate: 'Solo una dirección puede ser la principal.' },
  contact_type_id: { not_found: 'Ese tipo de contacto ya no está activo. Elige otro.' },
};

const SAVE_CONFLICTS = {
  conflict:
    'Otra persona cambió este proveedor mientras lo editabas. Recarga la página para ver sus cambios.',
};

/** `/proveedores/nuevo`. */
export function SupplierCreatePage() {
  return (
    <>
      <PageHeader title="Nuevo proveedor" />
      <SupplierForm supplier={null} readOnly={false} />
    </>
  );
}

/** `/proveedores/:supplierId/editar`. */
export function SupplierEditPage() {
  return <SupplierPage readOnly={false} />;
}

/** `/proveedores/:supplierId`: the supplier as whoever may only view the section sees it. */
export function SupplierViewPage() {
  return <SupplierPage readOnly />;
}

function SupplierPage({ readOnly }: { readOnly: boolean }) {
  const { supplierId } = useParams();
  const supplier = useSupplier(supplierId);

  if (supplier.isError) {
    return <Alert severity="error">{problemMessage(supplier.error)}</Alert>;
  }
  if (supplier.isPending) {
    return <CircularProgress aria-label="Cargando el proveedor" />;
  }
  return <LoadedSupplier supplier={supplier.data} readOnly={readOnly} />;
}

function LoadedSupplier({ supplier, readOnly }: { supplier: Supplier; readOnly: boolean }) {
  const can = useCan();
  return (
    <>
      <PageHeader
        title={readOnly ? supplier.name : 'Editar proveedor'}
        actions={
          can('audit_logs', 'view') ? (
            <Button component={RouterLink} to={`/auditoria?tipo=suppliers&registro=${supplier.id}`}>
              Ver historial
            </Button>
          ) : null
        }
      />
      {/* A different supplier (or a refetch after saving) restarts the form from the server's copy. */}
      <SupplierForm
        key={`${supplier.id}:${supplier.version}`}
        supplier={supplier}
        readOnly={readOnly}
      />
    </>
  );
}

function SupplierForm({ supplier, readOnly }: { supplier: Supplier | null; readOnly: boolean }) {
  const navigate = useNavigate();
  const create = useCreateSupplier();
  const update = useUpdateSupplier(supplier?.id ?? '');
  const [draft, setDraft] = useState<SupplierDraft>(() => draftOf(supplier));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [inactiveHolder, setInactiveHolder] = useState<{ id: string; name: string } | null>(null);
  const setActive = useSetSupplierActive();
  const can = useCan();
  const patch = (changes: Partial<SupplierDraft>) =>
    setDraft((current) => ({ ...current, ...changes }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFieldErrors({});
    setFailure(null);
    setInactiveHolder(null);
    const body = bodyOf(draft);
    try {
      if (supplier) {
        await update.mutateAsync({ ...body, version: supplier.version });
      } else {
        await create.mutateAsync(body);
      }
      navigate('/proveedores');
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.code === 'identification_taken' || error.code === 'identification_inactive')
      ) {
        setFieldErrors({ identification: problemMessage(error) });
        // Whoever may reactivate is told which supplier holds it, to do that instead of registering it again.
        const { inactive_supplier_id: id, inactive_supplier_name: name } = error.details;
        if (typeof id === 'string' && typeof name === 'string') {
          setInactiveHolder({ id, name });
        }
        return;
      }
      // Rows report their errors as «contacts.1.email»: the message depends on the last part of the name.
      const codes = error instanceof ApiError ? error.fieldErrors : {};
      const rowMessages = Object.fromEntries(
        Object.entries(codes).map(([field, code]) => [
          field,
          fieldMessage(code, FIELD_MESSAGES[field.split('.').at(-1) ?? field] ?? {}),
        ]),
      );
      setFieldErrors(rowMessages);
      setFailure(
        Object.keys(rowMessages).length === 0 ? problemMessage(error, SAVE_CONFLICTS) : null,
      );
    }
  };

  const busy = create.isPending || update.isPending;

  const reactivateHolder = async () => {
    if (!inactiveHolder) {
      return;
    }
    try {
      await setActive.mutateAsync({ supplierId: inactiveHolder.id, active: true });
      // The supplier that already exists is the one to correct, not a new one.
      navigate(
        can('suppliers', 'edit') ? `/proveedores/${inactiveHolder.id}/editar` : '/proveedores',
      );
    } catch (error) {
      setInactiveHolder(null);
      setFailure(problemMessage(error));
    }
  };
  const text = (
    label: string,
    key: 'name' | 'legalName' | 'identification' | 'creditDays' | 'creditLimit',
    errorKey: string,
    props: {
      required?: boolean;
      maxLength: number;
      inputMode?: 'numeric' | 'decimal';
      autoFocus?: boolean;
    },
  ) => (
    <TextField
      label={label}
      value={draft[key]}
      onChange={(event) => patch({ [key]: event.target.value })}
      error={Boolean(fieldErrors[errorKey])}
      helperText={fieldErrors[errorKey]}
      slotProps={{
        htmlInput: { maxLength: props.maxLength, readOnly, inputMode: props.inputMode },
      }}
      required={props.required && !readOnly}
      autoFocus={props.autoFocus && !readOnly}
      fullWidth
    />
  );

  return (
    <FormPage onSubmit={(event) => void submit(event)} maxWidth={760}>
      {failure ? <Alert severity="error">{failure}</Alert> : null}
      {inactiveHolder ? (
        <Alert
          severity="warning"
          action={
            <Button
              color="inherit"
              size="small"
              disabled={setActive.isPending}
              onClick={() => void reactivateHolder()}
            >
              {`Reactivar «${inactiveHolder.name}»`}
            </Button>
          }
        >
          Ese proveedor ya está registrado y está inactivo. Reactívalo para corregir sus datos en
          lugar de crear uno nuevo.
        </Alert>
      ) : null}
      {supplier && !supplier.is_active ? (
        <Alert severity="info">
          Este proveedor está inactivo. Puedes corregir sus datos; para que vuelva a las listas,
          reactívalo desde la lista.
        </Alert>
      ) : null}

      <Typography variant="h6" component="h2">
        Datos
      </Typography>
      {text('Nombre comercial', 'name', 'name', {
        required: true,
        maxLength: 190,
        autoFocus: true,
      })}
      {text('Razón social', 'legalName', 'legal_name', { maxLength: 190 })}
      <TextField
        select
        label="Identificación"
        value={draft.identificationType}
        onChange={(event) =>
          patch({ identificationType: event.target.value as IdentificationType })
        }
        slotProps={{ input: { readOnly } }}
        fullWidth
      >
        {(Object.keys(IDENTIFICATION_LABELS) as IdentificationType[]).map((type) => (
          <MenuItem key={type} value={type}>
            {IDENTIFICATION_LABELS[type]}
          </MenuItem>
        ))}
      </TextField>
      {draft.identificationType === 'none'
        ? null
        : text(
            draft.identificationType === 'nit' ? 'Número de NIT' : 'Número de CUI',
            'identification',
            'identification',
            { required: true, maxLength: 30 },
          )}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        {text('Días de crédito', 'creditDays', 'credit_days', {
          maxLength: 5,
          inputMode: 'numeric',
        })}
        {text('Límite de crédito', 'creditLimit', 'credit_limit', {
          maxLength: 15,
          inputMode: 'decimal',
        })}
      </Stack>

      <Typography variant="h6" component="h2">
        Direcciones
      </Typography>
      <AddressesEditor
        rows={draft.addresses}
        onChange={(addresses) => patch({ addresses })}
        errors={fieldErrors}
        readOnly={readOnly}
      />

      <Typography variant="h6" component="h2">
        Contactos
      </Typography>
      <ContactsEditor
        rows={draft.contacts}
        onChange={(contacts) => patch({ contacts })}
        errors={fieldErrors}
        readOnly={readOnly}
      />

      <FormActions>
        <Button component={RouterLink} to="/proveedores" variant="outlined" color="inherit">
          {readOnly ? 'Volver' : 'Cancelar'}
        </Button>
        {readOnly ? null : (
          <Button type="submit" variant="contained" disabled={busy || !draft.name.trim()}>
            Guardar
          </Button>
        )}
      </FormActions>
    </FormPage>
  );
}
