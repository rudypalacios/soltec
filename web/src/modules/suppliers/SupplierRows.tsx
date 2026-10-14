import AddIcon from '@mui/icons-material/Add';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { useCan } from '../access/SessionContext';
import { viewOf } from '../parameters/parameterViews';
import { useParameterOptions } from '../parameters/useParameters';
import { QuickContactType } from './QuickContactType';
import { emptyAddress, emptyContact, type AddressDraft, type ContactDraft } from './supplierDrafts';

type Errors = Record<string, string>;
const CONTACT_TYPES = viewOf('contact-types');
const NO_TYPE = '';

/** One card of a repeating group: a title with its remove button over the fields, two columns on a desktop. */
function RowCard({
  title,
  onRemove,
  removeLabel,
  children,
}: {
  title: string;
  onRemove?: () => void;
  removeLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="subtitle2" component="h3">
            {title}
          </Typography>
          {onRemove ? (
            <IconButton
              aria-label={removeLabel}
              onClick={onRemove}
              sx={{ minWidth: 44, minHeight: 44 }}
            >
              <DeleteOutline />
            </IconButton>
          ) : null}
        </Stack>
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
          }}
        >
          {children}
        </Box>
      </Stack>
    </Paper>
  );
}

function Field({
  label,
  value,
  onChange,
  error,
  maxLength,
  readOnly,
  required,
  type,
  wide,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  maxLength: number;
  readOnly: boolean;
  required?: boolean;
  type?: string;
  wide?: boolean;
}) {
  return (
    <TextField
      label={label}
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      error={Boolean(error)}
      helperText={error}
      slotProps={{ htmlInput: { maxLength, readOnly } }}
      required={required && !readOnly}
      fullWidth
      sx={wide ? { gridColumn: { sm: '1 / -1' } } : undefined}
    />
  );
}

export function AddressesEditor({
  rows,
  onChange,
  errors,
  readOnly,
}: {
  rows: AddressDraft[];
  onChange: (rows: AddressDraft[]) => void;
  errors: Errors;
  readOnly: boolean;
}) {
  const update = (key: string, patch: Partial<AddressDraft>) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  // One address is the primary one: marking another clears the previous.
  const markPrimary = (key: string) =>
    onChange(rows.map((row) => ({ ...row, isPrimary: row.key === key })));

  return (
    <Stack spacing={2}>
      {rows.length === 0 ? <Typography color="text.secondary">Sin direcciones.</Typography> : null}
      {rows.map((row, index) => {
        const error = (field: string) => errors[`addresses.${index}.${field}`];
        return (
          <RowCard
            key={row.key}
            title={`Dirección ${index + 1}`}
            removeLabel={`Quitar dirección ${index + 1}`}
            onRemove={readOnly ? undefined : () => onChange(rows.filter((r) => r.key !== row.key))}
          >
            <Field
              label="Etiqueta"
              value={row.label}
              error={error('label')}
              maxLength={60}
              required
              readOnly={readOnly}
              onChange={(label) => update(row.key, { label })}
            />
            <FormControlLabel
              label="Principal"
              control={
                <Checkbox
                  checked={row.isPrimary}
                  disabled={readOnly}
                  onChange={(event) =>
                    event.target.checked
                      ? markPrimary(row.key)
                      : update(row.key, { isPrimary: false })
                  }
                />
              }
            />
            <Field
              label="Dirección"
              value={row.address}
              error={error('address')}
              maxLength={255}
              required
              readOnly={readOnly}
              wide
              onChange={(address) => update(row.key, { address })}
            />
            <Field
              label="Zona"
              value={row.zone}
              error={error('zone')}
              maxLength={100}
              readOnly={readOnly}
              onChange={(zone) => update(row.key, { zone })}
            />
            <Field
              label="País"
              value={row.country}
              error={error('country')}
              maxLength={100}
              readOnly={readOnly}
              onChange={(country) => update(row.key, { country })}
            />
          </RowCard>
        );
      })}
      {readOnly ? null : (
        <Box>
          <Button
            startIcon={<AddIcon />}
            onClick={() => onChange([...rows, emptyAddress(rows.length === 0)])}
          >
            Agregar dirección
          </Button>
        </Box>
      )}
    </Stack>
  );
}

export function ContactsEditor({
  rows,
  onChange,
  errors,
  readOnly,
}: {
  rows: ContactDraft[];
  onChange: (rows: ContactDraft[]) => void;
  errors: Errors;
  readOnly: boolean;
}) {
  const can = useCan();
  // Whoever edits suppliers may choose among the active types without any access to their own section (ADR-0024).
  const types = useParameterOptions(CONTACT_TYPES, !readOnly);
  // The row that asked for a new type, so the type created lands on it.
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const update = (key: string, patch: Partial<ContactDraft>) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  return (
    <Stack spacing={2}>
      {rows.length === 0 ? <Typography color="text.secondary">Sin contactos.</Typography> : null}
      {rows.map((row, index) => {
        const error = (field: string) => errors[`contacts.${index}.${field}`];
        // The type the contact already has stays on the list even if it was switched off since.
        const choices = (types.data?.data ?? []).slice();
        if (row.contactType && !choices.some((type) => type.id === row.contactType?.id)) {
          choices.push(row.contactType);
        }
        return (
          <RowCard
            key={row.key}
            title={`Contacto ${index + 1}`}
            removeLabel={`Quitar contacto ${index + 1}`}
            onRemove={readOnly ? undefined : () => onChange(rows.filter((r) => r.key !== row.key))}
          >
            <Field
              label="Nombre"
              value={row.name}
              error={error('name')}
              maxLength={150}
              required
              readOnly={readOnly}
              onChange={(name) => update(row.key, { name })}
            />
            <Field
              label="Cargo"
              value={row.jobTitle}
              error={error('job_title')}
              maxLength={100}
              readOnly={readOnly}
              onChange={(jobTitle) => update(row.key, { jobTitle })}
            />
            <Box>
              <TextField
                select
                label="Tipo de contacto"
                value={row.contactType?.id ?? NO_TYPE}
                onChange={(event) =>
                  update(row.key, {
                    contactType: choices.find((type) => type.id === event.target.value) ?? null,
                  })
                }
                error={Boolean(error('contact_type_id'))}
                helperText={error('contact_type_id')}
                slotProps={{ input: { readOnly } }}
                fullWidth
              >
                <MenuItem value={NO_TYPE}>Sin tipo</MenuItem>
                {choices.map((type) => (
                  <MenuItem key={type.id} value={type.id}>
                    {type.name}
                  </MenuItem>
                ))}
              </TextField>
              {!readOnly && can('contact_types', 'create') ? (
                <Button size="small" onClick={() => setCreatingFor(row.key)} sx={{ mt: 0.5 }}>
                  Crear tipo de contacto
                </Button>
              ) : null}
            </Box>
            <Field
              label="Correo"
              value={row.email}
              error={error('email')}
              maxLength={190}
              type="email"
              readOnly={readOnly}
              onChange={(email) => update(row.key, { email })}
            />
            <Field
              label="Teléfono"
              value={row.phone}
              error={error('phone')}
              maxLength={40}
              type="tel"
              readOnly={readOnly}
              onChange={(phone) => update(row.key, { phone })}
            />
            <Field
              label="Celular"
              value={row.mobile}
              error={error('mobile')}
              maxLength={40}
              type="tel"
              readOnly={readOnly}
              onChange={(mobile) => update(row.key, { mobile })}
            />
            <Field
              label="Dirección"
              value={row.address}
              error={error('address')}
              maxLength={255}
              readOnly={readOnly}
              wide
              onChange={(address) => update(row.key, { address })}
            />
            <Field
              label="Zona"
              value={row.zone}
              error={error('zone')}
              maxLength={100}
              readOnly={readOnly}
              onChange={(zone) => update(row.key, { zone })}
            />
            <Field
              label="País"
              value={row.country}
              error={error('country')}
              maxLength={100}
              readOnly={readOnly}
              onChange={(country) => update(row.key, { country })}
            />
          </RowCard>
        );
      })}
      {readOnly ? null : (
        <Box>
          <Button startIcon={<AddIcon />} onClick={() => onChange([...rows, emptyContact()])}>
            Agregar contacto
          </Button>
        </Box>
      )}
      <QuickContactType
        open={creatingFor !== null}
        onClose={() => setCreatingFor(null)}
        onCreated={(type) => {
          if (creatingFor) {
            update(creatingFor, { contactType: type });
          }
          setCreatingFor(null);
        }}
      />
    </Stack>
  );
}
