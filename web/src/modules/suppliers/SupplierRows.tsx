import AddIcon from '@mui/icons-material/Add';
import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { useCan } from '../access/SessionContext';
import { viewOf } from '../parameters/parameterViews';
import { QuickParameterDialog } from '../parameters/QuickParameterDialog';
import { useParameterOptions } from '../parameters/useParameters';
import { RowCard, RowField } from '../../components/RowCard';
import { emptyContact, type ContactDraft } from './supplierDrafts';

type Errors = Record<string, string>;
const CONTACT_TYPES = viewOf('contact-types');
const NO_TYPE = '';

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
            <RowField
              label="Nombre"
              value={row.name}
              error={error('name')}
              maxLength={150}
              required
              readOnly={readOnly}
              onChange={(name) => update(row.key, { name })}
            />
            <RowField
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
            <RowField
              label="Correo"
              value={row.email}
              error={error('email')}
              maxLength={190}
              type="email"
              readOnly={readOnly}
              onChange={(email) => update(row.key, { email })}
            />
            <RowField
              label="Teléfono"
              value={row.phone}
              error={error('phone')}
              maxLength={40}
              type="tel"
              readOnly={readOnly}
              onChange={(phone) => update(row.key, { phone })}
            />
            <RowField
              label="Celular"
              value={row.mobile}
              error={error('mobile')}
              maxLength={40}
              type="tel"
              readOnly={readOnly}
              onChange={(mobile) => update(row.key, { mobile })}
            />
            <RowField
              label="Dirección"
              value={row.address}
              error={error('address')}
              maxLength={255}
              readOnly={readOnly}
              wide
              onChange={(address) => update(row.key, { address })}
            />
            <RowField
              label="Zona"
              value={row.zone}
              error={error('zone')}
              maxLength={100}
              readOnly={readOnly}
              onChange={(zone) => update(row.key, { zone })}
            />
            <RowField
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
      <QuickParameterDialog
        view={CONTACT_TYPES}
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
