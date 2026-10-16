import { MenuItem, Stack, TextField } from '@mui/material';
import { IDENTIFICATION_LABELS, type IdentificationType } from '../../components/identification';
import type { BillingDraft } from './clientDrafts';
import { usePaymentMethodOptions, useTaxRegimeOptions } from './useClients';

type Errors = Record<string, string>;

/** The kind of identification and its number: the number only for a NIT or a CUI. The server validates it. */
export function IdentificationFields({
  type,
  value,
  onType,
  onValue,
  error,
  required = false,
}: {
  type: IdentificationType;
  value: string;
  onType: (type: IdentificationType) => void;
  onValue: (value: string) => void;
  error?: string;
  required?: boolean;
}) {
  return (
    <>
      <TextField
        select
        label="Identificación"
        value={type}
        onChange={(event) => onType(event.target.value as IdentificationType)}
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
          value={value}
          onChange={(event) => onValue(event.target.value)}
          error={Boolean(error)}
          helperText={error}
          required={required}
          slotProps={{ htmlInput: { maxLength: 30 } }}
          fullWidth
        />
      )}
    </>
  );
}

/** What a customer is invoiced with: the legal name, the tax regime, how it pays and its credit. */
export function BillingFields({
  draft,
  onChange,
  errors,
  keepRegime,
  keepMethod,
}: {
  draft: BillingDraft;
  onChange: (changes: Partial<BillingDraft>) => void;
  errors: Errors;
  /** A regime or a method the client already had stays on the list even if it was switched off since. */
  keepRegime?: { id: string; name: string } | null;
  keepMethod?: { id: string; name: string } | null;
}) {
  const regimes = useTaxRegimeOptions();
  const methods = usePaymentMethodOptions();
  const withKept = (
    found: { id: string; name: string }[],
    kept: { id: string; name: string } | null | undefined,
  ) => (kept && !found.some((option) => option.id === kept.id) ? [kept, ...found] : found);

  return (
    <>
      <TextField
        label="Nombre fiscal"
        value={draft.legalName}
        onChange={(event) => onChange({ legalName: event.target.value })}
        error={Boolean(errors['billing_profile.legal_name'])}
        helperText={
          errors['billing_profile.legal_name'] ?? 'El nombre al que se emiten las facturas.'
        }
        required
        slotProps={{ htmlInput: { maxLength: 190 } }}
        fullWidth
      />
      <TextField
        select
        label="Régimen fiscal"
        value={draft.taxRegimeId}
        onChange={(event) => onChange({ taxRegimeId: event.target.value })}
        error={Boolean(errors['billing_profile.tax_regime_id'])}
        helperText={errors['billing_profile.tax_regime_id']}
        required
        fullWidth
      >
        {withKept(regimes.data?.data ?? [], keepRegime).map((regime) => (
          <MenuItem key={regime.id} value={regime.id}>
            {regime.name}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        label="Forma de pago"
        slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
        value={draft.paymentMethodId}
        onChange={(event) => onChange({ paymentMethodId: event.target.value })}
        error={Boolean(errors['billing_profile.payment_method_id'])}
        helperText={errors['billing_profile.payment_method_id']}
        fullWidth
      >
        <MenuItem value="">Sin definir</MenuItem>
        {withKept(methods.data?.data ?? [], keepMethod).map((method) => (
          <MenuItem key={method.id} value={method.id}>
            {method.name}
          </MenuItem>
        ))}
      </TextField>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          label="Días de crédito"
          value={draft.creditDays}
          onChange={(event) => onChange({ creditDays: event.target.value })}
          error={Boolean(errors['billing_profile.credit_days'])}
          helperText={errors['billing_profile.credit_days']}
          slotProps={{ htmlInput: { maxLength: 5, inputMode: 'numeric' } }}
          fullWidth
        />
        <TextField
          label="Límite de crédito"
          value={draft.creditLimit}
          onChange={(event) => onChange({ creditLimit: event.target.value })}
          error={Boolean(errors['billing_profile.credit_limit'])}
          helperText={errors['billing_profile.credit_limit']}
          slotProps={{ htmlInput: { maxLength: 15, inputMode: 'decimal' } }}
          fullWidth
        />
      </Stack>
    </>
  );
}

/** What each error code says on a field of a client. The same wording serves the form and the conversion. */
export const FIELD_MESSAGES: Record<string, Record<string, string>> = {
  identification: {
    invalid: 'No es un NIT o CUI válido. Revisa el número y el dígito verificador.',
    not_applicable: 'Sin identificación no lleva número.',
  },
  credit_days: {
    out_of_range: 'Escribe un número de días entre 0 y 65 535.',
    invalid: 'Escribe un número entero de días.',
  },
  credit_limit: { invalid: 'Escribe un monto con hasta dos decimales, por ejemplo 15000.50.' },
  is_primary: { duplicate: 'Solo una dirección puede ser la principal.' },
  tax_regime_id: { not_found: 'Ese régimen ya no está activo. Elige otro.' },
  payment_method_id: { not_found: 'Esa forma de pago ya no está activa. Elige otra.' },
  status_id: { not_found: 'Ese estado ya no está activo. Elige otro.' },
  segment_id: { not_found: 'Ese segmento ya no está activo. Elige otro.' },
  area_id: { not_found: 'Esa área ya no está activa. Elige otra.' },
  margin_level_id: { not_found: 'Ese nivel de margen ya no está activo. Elige otro.' },
  billing_profile: {
    required: 'Un cliente necesita su perfil de facturación.',
    not_applicable: 'Un prospecto no tiene perfil de facturación.',
  },
};
