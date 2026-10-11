import { Alert, Button, CircularProgress, TextField, Typography } from '@mui/material';
import type { components } from '@soltec/shared';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { FormActions, FormPage } from '../../components/FormPage';
import { fieldMessages, problemMessage } from '../access/messages';
import { useCan } from '../access/SessionContext';
import { useSaveSecuritySettings, useSecuritySettings } from './useSettings';

type SecuritySettings = components['schemas']['SecuritySettings'];

/** What each parameter is called, how far it may go (the API enforces the same limits) and what it does. */
const FIELDS = [
  {
    name: 'max_failed_attempts',
    label: 'Intentos fallidos antes de bloquear la cuenta',
    min: 3,
    max: 20,
    hint: 'Contraseñas incorrectas seguidas. Un ingreso correcto reinicia la cuenta.',
  },
  {
    name: 'lockout_minutes',
    label: 'Minutos que dura el bloqueo',
    min: 1,
    max: 1440,
    hint: 'Quien administra usuarios también puede desbloquear antes.',
  },
  {
    name: 'password_expiry_days',
    label: 'Días para que venza una contraseña',
    min: 30,
    max: 365,
    hint: 'Se cuentan desde que se fijó la contraseña. Al vencer, se pide cambiarla al ingresar.',
  },
  {
    name: 'password_min_length',
    label: 'Largo mínimo de una contraseña',
    min: 12,
    max: 72,
    hint: 'Solo puede subir de 12. Las contraseñas actuales siguen valiendo hasta que se cambien.',
  },
  {
    name: 'web_idle_minutes',
    label: 'Minutos de inactividad en el navegador',
    min: 5,
    max: 1440,
    hint: 'Aplica a las sesiones nuevas y a las que se renueven; las abiertas conservan su plazo.',
  },
  {
    name: 'mobile_refresh_days',
    label: 'Días que dura la sesión en el teléfono',
    min: 1,
    max: 90,
    hint: 'Aplica a las sesiones nuevas y a las que se renueven.',
  },
] as const;

type FieldName = (typeof FIELDS)[number]['name'];

/** A whole number between `min` and `max`, or null. */
function parseWhole(text: string, min: number, max: number): number | null {
  if (!/^\d{1,5}$/.test(text.trim())) {
    return null;
  }
  const value = Number(text);
  return value >= min && value <= max ? value : null;
}

/** `/configuracion/seguridad`: lockout, password and session parameters. */
export function SecurityPage() {
  const settings = useSecuritySettings();

  if (settings.isError) {
    return <Alert severity="error">{problemMessage(settings.error)}</Alert>;
  }
  if (!settings.data) {
    return <CircularProgress aria-label="Cargando la seguridad" />;
  }
  return <SecurityForm settings={settings.data} />;
}

function toValues(settings: SecuritySettings): Record<FieldName, string> {
  return Object.fromEntries(FIELDS.map(({ name }) => [name, String(settings[name])])) as Record<
    FieldName,
    string
  >;
}

function SecurityForm({ settings }: { settings: SecuritySettings }) {
  const canEdit = useCan()('security_settings', 'edit');
  const save = useSaveSecuritySettings();
  const [values, setValues] = useState(() => toValues(settings));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set = (name: FieldName) => (event: ChangeEvent<HTMLInputElement>) =>
    setValues((current) => ({ ...current, [name]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    setFailure(null);

    const parsed: Partial<Record<FieldName, number>> = {};
    const found: Record<string, string> = {};
    for (const { name, min, max } of FIELDS) {
      const value = parseWhole(values[name], min, max);
      if (value === null) {
        found[name] = `Escribe un número entero entre ${min} y ${max}.`;
      } else {
        parsed[name] = value;
      }
    }
    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }

    try {
      const updated = await save.mutateAsync({
        version: settings.version,
        ...(parsed as Record<FieldName, number>),
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

  return (
    <FormPage onSubmit={(event) => void submit(event)}>
      <Typography variant="h6" component="h2">
        Seguridad
      </Typography>
      {failure ? <Alert severity="error">{failure}</Alert> : null}
      {saved ? <Alert severity="success">Se guardaron los valores.</Alert> : null}
      {FIELDS.map(({ name, label, hint }) => (
        <TextField
          key={name}
          label={label}
          value={values[name]}
          onChange={set(name)}
          error={name in errors}
          helperText={errors[name] ?? hint}
          disabled={!canEdit}
          slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 4 } }}
          fullWidth
        />
      ))}
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
