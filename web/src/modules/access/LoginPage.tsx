import { Alert, Button, CircularProgress, Link, Stack, TextField } from '@mui/material';
import { useState, type FormEvent } from 'react';
import { Link as RouterLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { PublicCard } from '../../components/PublicCard';
import { CHANGE_PASSWORD_PATH, FORGOT_PASSWORD_PATH } from './guards';
import { problemMessage } from './messages';
import { useSession, useSessionState } from './SessionContext';

/** Where to go after signing in: where the person was heading, if it was inside the app. */
function destinationOf(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/';
}

export function LoginPage() {
  const session = useSession();
  const state = useSessionState();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  if (state.status === 'authenticated' && !submitting) {
    return (
      <Navigate
        to={state.passwordChangeRequired ? CHANGE_PASSWORD_PATH : destinationOf(location.state)}
        replace
      />
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setFailure(null);
    try {
      const { passwordChangeRequired } = await session.login(email.trim(), password);
      navigate(passwordChangeRequired ? CHANGE_PASSWORD_PATH : destinationOf(location.state), {
        replace: true,
      });
    } catch (error) {
      setFailure(problemMessage(error));
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PublicCard title="Iniciar sesión" subtitle="Entra con tu correo y tu contraseña.">
      <Stack component="form" spacing={2.5} onSubmit={(event) => void submit(event)} noValidate>
        {failure ? <Alert severity="error">{failure}</Alert> : null}
        <TextField
          label="Correo"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoFocus
          fullWidth
        />
        <TextField
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          fullWidth
        />
        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={submitting || !email || !password}
        >
          {submitting ? (
            <CircularProgress size={22} color="inherit" aria-label="Entrando" />
          ) : (
            'Entrar'
          )}
        </Button>
        <Link
          component={RouterLink}
          to={FORGOT_PASSWORD_PATH}
          sx={{ alignSelf: 'center', py: 1.5 }}
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </Stack>
    </PublicCard>
  );
}
