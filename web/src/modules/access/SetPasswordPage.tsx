import { Alert, Button, Stack, TextField } from '@mui/material';
import { useEffect, useState, type FormEvent } from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { PublicCard } from '../../components/PublicCard';
import { LOGIN_PATH } from './guards';
import { fieldMessages, problemMessage } from './messages';
import { useAcceptInvitation, useResetPassword } from './useCredentials';

const PASSWORD_MESSAGES = {
  password: {
    too_short: 'Debe tener al menos 12 caracteres.',
    too_long: 'Debe tener 72 caracteres como máximo.',
    invalid: 'No puede ser igual a tu correo.',
  },
};

/**
 * The token travels in the fragment of the link (`#token=...`), which browsers never send to a server. It is read
 * once and removed from the address bar so it does not stay in the history or in a screenshot.
 */
function useLinkToken(): string | null {
  const location = useLocation();
  const navigate = useNavigate();
  const [token, setToken] = useState(() => tokenOf(location.hash));
  useEffect(() => {
    if (location.hash !== '') {
      // A link opened in the same tab replaces the previous one.
      setToken((current) => tokenOf(location.hash) ?? current);
      navigate(location.pathname, { replace: true });
    }
  }, [location.hash, location.pathname, navigate]);
  return token;
}

function tokenOf(hash: string): string | null {
  return new URLSearchParams(hash.slice(1)).get('token');
}

interface Copy {
  title: string;
  subtitle: string;
  submitLabel: string;
  success: string;
}

function SetPasswordForm({
  copy,
  submit,
  pending,
}: {
  copy: Copy;
  submit: (body: { token: string; password: string }) => Promise<void>;
  pending: boolean;
}) {
  const token = useLinkToken();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const mismatch = repeat !== '' && password !== repeat;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    setFieldErrors({});
    if (password !== repeat) {
      setFieldErrors({ repeat: 'Las contraseñas no coinciden.' });
      return;
    }
    try {
      await submit({ token: token ?? '', password });
      setDone(true);
    } catch (error) {
      const fields = fieldMessages(error, PASSWORD_MESSAGES);
      setFieldErrors(fields);
      setFailure(Object.keys(fields).length === 0 ? problemMessage(error) : null);
    }
  };

  if (done) {
    return (
      <PublicCard title={copy.title}>
        <Stack spacing={2.5}>
          <Alert severity="success">{copy.success}</Alert>
          <Button component={RouterLink} to={LOGIN_PATH} variant="contained" size="large">
            Ir a iniciar sesión
          </Button>
        </Stack>
      </PublicCard>
    );
  }
  if (token === null || token === '') {
    return (
      <PublicCard title={copy.title}>
        <Stack spacing={2.5}>
          <Alert severity="error">
            El enlace está incompleto. Ábrelo desde el correo, tal como te llegó.
          </Alert>
          <Button component={RouterLink} to={LOGIN_PATH}>
            Ir a iniciar sesión
          </Button>
        </Stack>
      </PublicCard>
    );
  }

  return (
    <PublicCard title={copy.title} subtitle={copy.subtitle}>
      <Stack component="form" spacing={2.5} onSubmit={(event) => void onSubmit(event)} noValidate>
        {failure ? <Alert severity="error">{failure}</Alert> : null}
        <TextField
          label="Contraseña nueva"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={Boolean(fieldErrors.password)}
          helperText={fieldErrors.password ?? 'De 12 a 72 caracteres, distinta de tu correo.'}
          required
          autoFocus
          fullWidth
        />
        <TextField
          label="Repite la contraseña"
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={(event) => setRepeat(event.target.value)}
          error={mismatch || Boolean(fieldErrors.repeat)}
          helperText={mismatch ? 'Las contraseñas no coinciden.' : fieldErrors.repeat}
          required
          fullWidth
        />
        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={pending || !password || !repeat}
        >
          {copy.submitLabel}
        </Button>
      </Stack>
    </PublicCard>
  );
}

/** `/aceptar-invitacion`: the person chooses their first password. */
export function AcceptInvitationPage() {
  const accept = useAcceptInvitation();
  return (
    <SetPasswordForm
      copy={{
        title: 'Activa tu cuenta',
        subtitle: 'Elige la contraseña con la que vas a entrar.',
        submitLabel: 'Activar cuenta',
        success: 'Tu cuenta está activa. Ya puedes iniciar sesión con tu correo y tu contraseña.',
      }}
      submit={async (body) => accept.mutateAsync(body)}
      pending={accept.isPending}
    />
  );
}

/** `/restablecer-contrasena`: the link of the recovery email. */
export function ResetPasswordPage() {
  const reset = useResetPassword();
  return (
    <SetPasswordForm
      copy={{
        title: 'Restablecer contraseña',
        subtitle: 'Elige una contraseña nueva.',
        submitLabel: 'Guardar contraseña',
        success:
          'Tu contraseña cambió y se cerró tu sesión en todos tus dispositivos. Inicia sesión con la nueva.',
      }}
      submit={async (body) => reset.mutateAsync(body)}
      pending={reset.isPending}
    />
  );
}
