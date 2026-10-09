import AutorenewIcon from '@mui/icons-material/Autorenew';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { components } from '@soltec/shared';
import { useState, type FormEvent } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { generatePassword } from './generatePassword';
import { fieldMessages, problemMessage } from './messages';
import { useCreateUser } from './useUsers';
import { useRoles } from './useRoles';

type User = components['schemas']['User'];
type RoleOption = components['schemas']['Role'];

const FIELD_MESSAGES = {
  initial_password: {
    too_short: 'Debe tener al menos 12 caracteres.',
    too_long: 'Debe tener 72 caracteres como máximo.',
    invalid: 'No puede ser igual al correo.',
  },
  role_ids: { not_found: 'Algún perfil ya no existe o está inactivo.' },
};

export function UserCreatePage() {
  const create = useCreateUser();
  // Active internal roles. 100 is the most the API returns per page: more than that is not a realistic list of roles.
  const roles = useRoles({ status: 'active', user_type: 'internal', per_page: 100 });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [selected, setSelected] = useState<RoleOption[]>([]);
  const [password, setPassword] = useState(() => generatePassword());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [created, setCreated] = useState<{ user: User; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFieldErrors({});
    setFailure(null);
    try {
      const user = await create.mutateAsync({
        name: name.trim(),
        email: email.trim(),
        role_ids: selected.map((role) => role.id),
        initial_password: password,
      });
      setCreated({ user, password });
    } catch (error) {
      const fields = fieldMessages(error, FIELD_MESSAGES);
      setFieldErrors(fields);
      setFailure(Object.keys(fields).length === 0 ? problemMessage(error) : null);
    }
  };

  const startAnother = () => {
    setCreated(null);
    setName('');
    setEmail('');
    setSelected([]);
    setPassword(generatePassword());
    setCopied(false);
  };

  if (created) {
    return (
      <>
        <PageHeader title="Usuario creado" />
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 560 }}>
          <Stack spacing={2.5}>
            <Alert severity="success">
              {created.user.name} ({created.user.email}) ya puede iniciar sesión.
            </Alert>
            <Box>
              <Typography variant="subtitle2">Contraseña temporal</Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }}>
                <Typography
                  component="code"
                  sx={{ fontFamily: 'monospace', fontSize: 18, wordBreak: 'break-all' }}
                >
                  {created.password}
                </Typography>
                <Button
                  size="small"
                  startIcon={<ContentCopyIcon />}
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(created.password)
                      .then(() => setCopied(true));
                  }}
                >
                  {copied ? 'Copiada' : 'Copiar'}
                </Button>
              </Stack>
            </Box>
            <Alert severity="warning">
              Entrégala ahora: no se vuelve a mostrar. La persona deberá cambiarla en su primer
              inicio de sesión.
            </Alert>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button variant="contained" component={RouterLink} to="/usuarios">
                Volver a usuarios
              </Button>
              <Button onClick={startAnother}>Crear otro usuario</Button>
            </Stack>
          </Stack>
        </Paper>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Nuevo usuario" />
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 560 }}>
        <Stack component="form" spacing={2.5} onSubmit={(event) => void submit(event)} noValidate>
          {failure ? <Alert severity="error">{failure}</Alert> : null}
          <TextField
            label="Nombre"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={Boolean(fieldErrors.name)}
            helperText={fieldErrors.name}
            required
            fullWidth
            autoFocus
          />
          <TextField
            label="Correo"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={Boolean(fieldErrors.email)}
            helperText={fieldErrors.email}
            required
            fullWidth
          />
          <Autocomplete
            multiple
            options={roles.data?.data ?? []}
            loading={roles.isPending}
            value={selected}
            onChange={(_, value) => setSelected(value)}
            getOptionLabel={(role) => role.name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            noOptionsText={roles.isError ? problemMessage(roles.error) : 'No hay perfiles'}
            renderTags={(value, getTagProps) =>
              value.map((role, index) => {
                const { key, ...tagProps } = getTagProps({ index });
                return <Chip key={key} label={role.name} size="small" {...tagProps} />;
              })
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label="Perfiles"
                required={selected.length === 0}
                error={Boolean(fieldErrors.role_ids)}
                helperText={
                  fieldErrors.role_ids ?? 'Define a qué pantallas y acciones tendrá acceso.'
                }
              />
            )}
          />
          <TextField
            label="Contraseña temporal"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={Boolean(fieldErrors.initial_password)}
            helperText={
              fieldErrors.initial_password ??
              'La persona la cambiará en su primer inicio de sesión.'
            }
            required
            fullWidth
            autoComplete="off"
            slotProps={{
              htmlInput: { style: { fontFamily: 'monospace' } },
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <Button
                      size="small"
                      startIcon={<AutorenewIcon />}
                      onClick={() => setPassword(generatePassword())}
                    >
                      Generar
                    </Button>
                  </InputAdornment>
                ),
              },
            }}
          />
          <Stack direction={{ xs: 'column-reverse', sm: 'row' }} spacing={1}>
            <Button component={RouterLink} to="/usuarios">
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={create.isPending || !name || !email || selected.length === 0 || !password}
            >
              Crear usuario
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </>
  );
}
