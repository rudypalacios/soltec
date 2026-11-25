import { Alert, Button, CircularProgress, MenuItem, TextField, Typography } from '@mui/material';
import type { components } from '@soltec/shared';
import { useState, type FormEvent } from 'react';
import { FormActions, FormPage } from '../../components/FormPage';
import { formatMoment } from '../access/formatting';
import { problemMessage } from '../access/messages';
import { useCan } from '../access/SessionContext';
import { useNotificationSettings, useSaveNotificationSettings } from '../settings/useSettings';

type NotificationSettings = components['schemas']['NotificationSettings'];

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const label = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

/** `/configuracion/notificaciones`: the only thing about notifications that is configured. */
export function NotificationSettingsPage() {
  const settings = useNotificationSettings();

  if (settings.isError) {
    return <Alert severity="error">{problemMessage(settings.error)}</Alert>;
  }
  if (!settings.data) {
    return <CircularProgress aria-label="Cargando las notificaciones" />;
  }
  return <NotificationSettingsForm settings={settings.data} />;
}

function NotificationSettingsForm({ settings }: { settings: NotificationSettings }) {
  const canEdit = useCan()('notification_settings', 'edit');
  const save = useSaveNotificationSettings();
  const [hour, setHour] = useState(settings.due_reminder_hour);
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    setFailure(null);
    try {
      const updated = await save.mutateAsync({
        version: settings.version,
        due_reminder_hour: hour,
      });
      setHour(updated.due_reminder_hour);
      setSaved(true);
    } catch (error) {
      setFailure(
        problemMessage(error, {
          conflict:
            'Otra persona cambió este valor mientras lo editabas. Recarga la página e inténtalo de nuevo.',
        }),
      );
    }
  };

  return (
    <FormPage onSubmit={(event) => void submit(event)}>
      <Typography variant="h6" component="h2">
        Notificaciones
      </Typography>
      <Typography color="text.secondary">
        Quien participa en una tarea o en un cliente recibe aviso de lo que pasa en ellos, en la
        aplicación y por correo; eso no se configura. Lo único que se ajusta es la hora de los
        avisos de «vence mañana» y «venció».
      </Typography>
      {failure ? <Alert severity="error">{failure}</Alert> : null}
      {saved ? <Alert severity="success">Se guardó la hora.</Alert> : null}
      {settings.last_run_at ? null : (
        <Alert severity="warning">
          El proceso que crea esos avisos todavía no ha corrido. Quien administra el servidor debe
          agregar la tarea programada cada hora (docs/despliegue.md, 2.7).
        </Alert>
      )}
      <TextField
        select
        label="Hora de los avisos de vencimiento"
        value={hour}
        onChange={(event) => setHour(Number(event.target.value))}
        disabled={!canEdit}
        helperText="Hora de la empresa. El aviso sale en la primera corrida del proceso desde esa hora."
        fullWidth
      >
        {HOURS.map((value) => (
          <MenuItem key={value} value={value} sx={{ minHeight: 44 }}>
            {label(value)}
          </MenuItem>
        ))}
      </TextField>
      {settings.last_run_at ? (
        <Typography variant="body2" color="text.secondary">
          Última corrida del proceso: {formatMoment(settings.last_run_at)}.
        </Typography>
      ) : null}
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
