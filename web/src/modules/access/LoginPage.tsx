import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { CHANGE_PASSWORD_PATH } from './guards';
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
    <Box
      sx={{
        display: 'grid',
        placeItems: { xs: 'start center', sm: 'center' },
        minHeight: '100vh',
        p: 2,
      }}
    >
      <Card sx={{ width: '100%', maxWidth: 400 }} elevation={0} variant="outlined">
        <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
          <Stack component="form" spacing={2.5} onSubmit={(event) => void submit(event)} noValidate>
            <Box>
              <Typography variant="h5" component="h1">
                Soltec
              </Typography>
              <Typography color="text.secondary">Inicia sesión para continuar</Typography>
            </Box>
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
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
