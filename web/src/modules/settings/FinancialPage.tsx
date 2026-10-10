import { Alert, Button, CircularProgress, TextField, Typography } from '@mui/material';
import { percentToRate, rateToPercent, type components } from '@soltec/shared';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { FormActions, FormPage } from '../../components/FormPage';
import { fieldMessages, problemMessage } from '../access/messages';
import { useCan } from '../access/SessionContext';
import { useFinancialSettings, useSaveFinancialSettings } from './useSettings';

type FinancialSettings = components['schemas']['FinancialSettings'];

const PERCENT_ERROR = 'Escribe un porcentaje entre 0 y 99,999.';

/** A whole number of days between 1 and `max`, or null. */
function parseDays(text: string, max: number): number | null {
  if (!/^\d{1,5}$/.test(text.trim())) {
    return null;
  }
  const days = Number(text);
  return days >= 1 && days <= max ? days : null;
}

/** `/configuracion/finanzas`: tax rates and the periods the business rules use. */
export function FinancialPage() {
  const settings = useFinancialSettings();

  if (settings.isError) {
    return <Alert severity="error">{problemMessage(settings.error)}</Alert>;
  }
  if (!settings.data) {
    return <CircularProgress aria-label="Cargando las finanzas" />;
  }
  return <FinancialForm settings={settings.data} />;
}

function toValues(settings: FinancialSettings) {
  return {
    vat: rateToPercent(settings.vat_rate) ?? '',
    isr: rateToPercent(settings.income_tax_rate) ?? '',
    stale: String(settings.stale_cost_days),
    validity: String(settings.quote_validity_days),
  };
}

function FinancialForm({ settings }: { settings: FinancialSettings }) {
  const canEdit = useCan()('financial_settings', 'edit');
  const save = useSaveFinancialSettings();
  const [values, setValues] = useState(() => toValues(settings));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set = (name: keyof typeof values) => (event: ChangeEvent<HTMLInputElement>) =>
    setValues((current) => ({ ...current, [name]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    setFailure(null);

    const vat = percentToRate(values.vat);
    const isr = percentToRate(values.isr);
    const stale = parseDays(values.stale, 3650);
    const validity = parseDays(values.validity, 365);
    const found: Record<string, string> = {};
    if (!vat) found.vat = PERCENT_ERROR;
    if (!isr) found.isr = PERCENT_ERROR;
    if (!stale) found.stale = 'Escribe un número de días entre 1 y 3650.';
    if (!validity) found.validity = 'Escribe un número de días entre 1 y 365.';
    setErrors(found);
    if (!vat || !isr || !stale || !validity) {
      return;
    }

    try {
      const updated = await save.mutateAsync({
        version: settings.version,
        vat_rate: vat,
        income_tax_rate: isr,
        stale_cost_days: stale,
        quote_validity_days: validity,
      });
      setValues(toValues(updated));
      setSaved(true);
    } catch (error) {
      setFailure(
        Object.keys(fieldMessages(error)).length > 0
          ? 'Revisa los valores e inténtalo de nuevo.'
          : problemMessage(error, {
              conflict:
                'Otra persona cambió estos valores mientras los editabas. Recarga la página e inténtalo de nuevo.',
            }),
      );
    }
  };

  const percentField = (name: 'vat' | 'isr', label: string) => (
    <TextField
      label={label}
      value={values[name]}
      onChange={set(name)}
      error={name in errors}
      helperText={errors[name]}
      disabled={!canEdit}
      slotProps={{
        htmlInput: { inputMode: 'decimal', maxLength: 6 },
        input: { endAdornment: <Typography color="text.secondary">%</Typography> },
      }}
      fullWidth
    />
  );
  const daysField = (name: 'stale' | 'validity', label: string, hint: string) => (
    <TextField
      label={label}
      value={values[name]}
      onChange={set(name)}
      error={name in errors}
      helperText={errors[name] ?? hint}
      disabled={!canEdit}
      slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 4 } }}
      fullWidth
    />
  );

  return (
    <FormPage onSubmit={(event) => void submit(event)}>
      <Typography variant="h6" component="h2">
        Finanzas
      </Typography>
      {failure ? <Alert severity="error">{failure}</Alert> : null}
      {saved ? <Alert severity="success">Se guardaron los valores.</Alert> : null}
      <TextField label="Moneda" value={settings.currency_code} disabled fullWidth />
      {percentField('vat', 'IVA')}
      {percentField('isr', 'ISR')}
      {daysField(
        'stale',
        'Días para considerar un costo desactualizado',
        'Pasado este plazo sin actualizar el costo de un producto, se avisa.',
      )}
      {daysField(
        'validity',
        'Validez de una cotización (días)',
        'Las cotizaciones ya emitidas conservan su validez.',
      )}
      {canEdit ? (
        <FormActions>
          <Button type="submit" variant="contained" disabled={save.isPending}>
            Guardar
          </Button>
        </FormActions>
      ) : null}
    </FormPage>
  );
}
