import { Alert, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { fieldMessages, problemMessage } from './messages';
import { useSession, useSessionState } from './SessionContext';

const NEW_PASSWORD_MESSAGES = {
  new_password: {
    too_short: 'Debe tener al menos 12 caracteres.',
    too_long: 'Debe tener 72 caracteres como máximo.',
    invalid: 'No puede ser igual a tu correo ni a tu contraseña actual.',
  },
};

export function ChangePasswordPage() {
  const session = useSession();
  const state = useSessionState();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  const mustChange = state.status === 'authenticated' && state.passwordChangeRequired;
  const mismatch = repeat !== '' && next !== repeat;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    setFieldErrors({});
    setDone(false);
    if (next !== repeat) {
      setFieldErrors({ repeat: 'Las contraseñas no coinciden.' });
      return;
    }

    setSubmitting(true);
    try {
      await session.changePassword(current, next);
      if (mustChange) {
        navigate('/', { replace: true });
        return;
      }
      setCurrent('');
      setNext('');
      setRepeat('');
      setDone(true);
    } catch (error) {
      setFieldErrors(fieldMessages(error, NEW_PASSWORD_MESSAGES));
      setFailure(problemMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader title="Cambiar contraseña" />
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 480 }}>
        <Stack component="form" spacing={2.5} onSubmit={(event) => void submit(event)} noValidate>
          {mustChange ? (
            <Alert severity="info">
              Tu contraseña es temporal o venció. Elige una nueva para continuar.
            </Alert>
          ) : null}
          {done ? (
            <Alert severity="success">
              Contraseña actualizada. Se cerró tu sesión en los demás dispositivos.
            </Alert>
          ) : null}
          {failure && Object.keys(fieldErrors).length === 0 ? (
            <Alert severity="error">{failure}</Alert>
          ) : null}
          <TextField
            label="Contraseña actual"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            error={Boolean(fieldErrors.current_password)}
            helperText={fieldErrors.current_password}
            required
            fullWidth
          />
          <TextField
            label="Contraseña nueva"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
            error={Boolean(fieldErrors.new_password)}
            helperText={
              fieldErrors.new_password ??
              'De 12 a 72 caracteres, distinta de tu correo y de la actual.'
            }
            required
            fullWidth
          />
          <TextField
            label="Repite la contraseña nueva"
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
            error={mismatch || Boolean(fieldErrors.repeat)}
            helperText={mismatch ? 'Las contraseñas no coinciden.' : fieldErrors.repeat}
            required
            fullWidth
          />
          <Typography variant="body2" color="text.secondary">
            Al cambiarla se cierra tu sesión en tus demás dispositivos.
          </Typography>
          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={submitting || !current || !next || !repeat}
          >
            Cambiar contraseña
          </Button>
        </Stack>
      </Paper>
    </>
  );
}
