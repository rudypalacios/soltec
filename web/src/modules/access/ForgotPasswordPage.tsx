import { Alert, Button, Stack, TextField } from '@mui/material';
import { useState, type FormEvent } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { PublicCard } from '../../components/PublicCard';
import { LOGIN_PATH } from './guards';
import { fieldMessages, problemMessage } from './messages';
import { useForgotPassword } from './useCredentials';

/** `/recuperar-contrasena`. The answer is the same for any address: the screen never says whether it exists. */
export function ForgotPasswordPage() {
  const forgot = useForgotPassword();
  const [email, setEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    setFieldErrors({});
    try {
      await forgot.mutateAsync({ email: email.trim() });
      setSent(true);
    } catch (error) {
      const fields = fieldMessages(error);
      setFieldErrors(fields);
      setFailure(Object.keys(fields).length === 0 ? problemMessage(error) : null);
    }
  };

  if (sent) {
    return (
      <PublicCard title="Revisa tu correo">
        <Stack spacing={2.5}>
          <Alert severity="info">
            Si hay una cuenta activa con ese correo, te enviamos un enlace para elegir una
            contraseña nueva. Vence en 1 hora y sirve una sola vez.
          </Alert>
          <Button variant="outlined" color="inherit" component={RouterLink} to={LOGIN_PATH}>
            Volver a iniciar sesión
          </Button>
        </Stack>
      </PublicCard>
    );
  }

  return (
    <PublicCard title="Recuperar contraseña" subtitle="Te enviaremos un enlace a tu correo.">
      <Stack component="form" spacing={2.5} onSubmit={(event) => void submit(event)} noValidate>
        {failure ? <Alert severity="error">{failure}</Alert> : null}
        <TextField
          label="Correo"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={Boolean(fieldErrors.email)}
          helperText={fieldErrors.email}
          required
          autoFocus
          fullWidth
        />
        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={forgot.isPending || !email}
        >
          Enviar enlace
        </Button>
        <Button variant="outlined" color="inherit" component={RouterLink} to={LOGIN_PATH}>
          Volver a iniciar sesión
        </Button>
      </Stack>
    </PublicCard>
  );
}
