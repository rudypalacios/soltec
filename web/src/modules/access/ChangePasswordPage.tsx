import { Alert, Button, TextField, Typography } from '@mui/material';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FormPage } from '../../components/FormPage';
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
    if (mismatch) {
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
      <FormPage maxWidth={480} onSubmit={(event) => void submit(event)}>
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
          onChange={(event) => {
            setNext(event.target.value);
            // What the server said was about the previous text, not this one.
            setFieldErrors((errors) => ({ ...errors, new_password: '' }));
          }}
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
          error={mismatch}
          helperText={mismatch ? 'Las contraseñas no coinciden.' : undefined}
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
          disabled={submitting || !current || !next || !repeat || mismatch}
        >
          Cambiar contraseña
        </Button>
      </FormPage>
    </>
  );
}
