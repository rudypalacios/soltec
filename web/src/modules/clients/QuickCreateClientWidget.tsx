import { Alert, Box, Button, Link, Stack, TextField, Typography } from '@mui/material';
import { useState, type FormEvent } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { problemMessage } from '../access/messages';
import { useCan } from '../access/SessionContext';
import { useCreateClient } from './useClients';

/**
 * The home widget that registers a prospect with just its name, for the adviser who is on the phone with them. The
 * rest of the data is completed in the client's own screen. It shows only to whoever may create clients.
 */
export function QuickCreateClientWidget() {
  const can = useCan();
  const create = useCreateClient();
  const [name, setName] = useState('');
  const [created, setCreated] = useState<{ id: string; code: string; name: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  if (!can('clients', 'create')) {
    return <Typography color="text.secondary">Tu perfil no puede registrar prospectos.</Typography>;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    setCreated(null);
    try {
      const client = await create.mutateAsync({ name: name.trim() });
      setCreated({ id: client.id, code: client.code, name: client.name });
      setName('');
    } catch (error) {
      setFailure(problemMessage(error));
    }
  };

  return (
    <Stack
      component="form"
      spacing={1.5}
      onSubmit={(event) => void submit(event)}
      noValidate
      sx={{ maxWidth: 480 }}
    >
      <Typography variant="h6" component="h2">
        Registrar un prospecto
      </Typography>
      {failure ? <Alert severity="error">{failure}</Alert> : null}
      {created ? (
        <Alert severity="success">
          Se registró «{created.name}» ({created.code}).{' '}
          <Link component={RouterLink} to={`/clientes/${created.id}/editar`}>
            Completar sus datos
          </Link>
        </Alert>
      ) : null}
      <TextField
        label="Nombre comercial"
        value={name}
        onChange={(event) => setName(event.target.value)}
        slotProps={{ htmlInput: { maxLength: 190 } }}
        fullWidth
      />
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button type="submit" variant="contained" disabled={create.isPending || !name.trim()}>
          Registrar
        </Button>
        <Button component={RouterLink} to="/clientes/nuevo" color="inherit">
          Formulario completo
        </Button>
      </Box>
    </Stack>
  );
}
