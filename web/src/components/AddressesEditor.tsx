import AddIcon from '@mui/icons-material/Add';
import { Box, Button, Checkbox, FormControlLabel, Stack, Typography } from '@mui/material';
import { emptyAddress, type AddressDraft } from './addressDrafts';
import { RowCard, RowField } from './RowCard';

type Errors = Record<string, string>;

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
            <RowField
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
            <RowField
              label="Dirección"
              value={row.address}
              error={error('address')}
              maxLength={255}
              required
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
