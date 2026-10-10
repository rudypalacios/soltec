import { Alert, Button, CircularProgress, Paper, Stack, TextField } from '@mui/material';
import type { components } from '@soltec/shared';
import { useState, type FormEvent } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import {
  DepartmentSelect,
  ManagerSelect,
  useDepartmentChoices,
  type NamedRef,
} from '../organization/OrganizationFields';
import { fieldMessages, problemMessage } from './messages';
import { useCurrentUser } from './SessionContext';
import { RoleSelect, USER_FIELD_MESSAGES, type RoleChoice } from './UserCreatePage';
import { useUpdateUser, useUser } from './useUsers';

type User = components['schemas']['User'];

const SAVE_CONFLICTS = {
  conflict:
    'Otra persona cambió a este usuario mientras lo editabas. Recarga la página para ver sus cambios.',
  last_admin: 'Debe quedar al menos un administrador activo.',
  forbidden:
    'No tienes permiso para cambiar a este usuario (por ejemplo, a un administrador, o tus propios perfiles).',
};

/** `/usuarios/:userId/editar`: name, email, profiles, department and direct manager of a user. */
export function UserEditPage() {
  const { userId } = useParams();
  const user = useUser(userId);

  if (user.isError) {
    return <Alert severity="error">{problemMessage(user.error)}</Alert>;
  }
  if (user.isPending) {
    return <CircularProgress aria-label="Cargando el usuario" />;
  }
  // A different user (or a refetch after saving) restarts the form from the server's copy.
  return <UserEditForm key={`${user.data.id}:${user.data.version}`} user={user.data} />;
}

function UserEditForm({ user }: { user: User }) {
  const navigate = useNavigate();
  const me = useCurrentUser();
  const update = useUpdateUser(user.id);
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [selected, setSelected] = useState<RoleChoice[]>(user.roles);
  const [department, setDepartment] = useState<NamedRef | null>(user.department);
  const [manager, setManager] = useState<NamedRef | null>(user.manager);
  const departmentChoices = useDepartmentChoices();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);

  const emailChanged = email.trim() !== user.email;
  const isSelf = me?.id === user.id;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFieldErrors({});
    setFailure(null);
    try {
      await update.mutateAsync({
        version: user.version,
        name: name.trim(),
        email: email.trim(),
        role_ids: selected.map((role) => role.id),
        // Without permission to list departments the field is hidden, and what is not sent stays as it was.
        ...(departmentChoices.canList ? { department_id: department?.id ?? null } : {}),
        manager_id: manager?.id ?? null,
      });
      navigate('/usuarios');
    } catch (error) {
      const fields = fieldMessages(error, USER_FIELD_MESSAGES);
      setFieldErrors(fields);
      setFailure(Object.keys(fields).length === 0 ? problemMessage(error, SAVE_CONFLICTS) : null);
    }
  };

  return (
    <>
      <PageHeader title="Editar usuario" />
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 560 }}>
        <Stack component="form" spacing={2.5} onSubmit={(event) => void submit(event)} noValidate>
          {failure ? <Alert severity="error">{failure}</Alert> : null}
          {!user.is_active ? (
            <Alert severity="info">
              Este usuario está inactivo. Puedes corregir sus datos; para que entre de nuevo,
              reactívalo desde la lista.
            </Alert>
          ) : null}
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
          {emailChanged && user.invitation_pending ? (
            <Alert severity="warning">
              Al cambiar el correo, el enlace de invitación ya enviado deja de servir. Después de
              guardar, reenvía la invitación desde la lista.
            </Alert>
          ) : null}
          <RoleSelect selected={selected} onChange={setSelected} error={fieldErrors.role_ids} />
          <DepartmentSelect
            value={department}
            onChange={setDepartment}
            choices={departmentChoices}
            error={fieldErrors.department_id}
          />
          <ManagerSelect
            value={manager}
            onChange={setManager}
            excludeUserId={user.id}
            error={fieldErrors.manager_id}
          />
          {isSelf ? (
            <Alert severity="info">
              Estás editando tu propia cuenta. Solo un administrador puede cambiar sus perfiles, y
              solo si queda otro administrador activo.
            </Alert>
          ) : null}
          <Stack direction={{ xs: 'column-reverse', sm: 'row' }} spacing={1}>
            <Button component={RouterLink} to="/usuarios">
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={
                update.isPending ||
                !name ||
                !email ||
                selected.length === 0 ||
                (departmentChoices.required && department === null)
              }
            >
              Guardar cambios
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </>
  );
}
