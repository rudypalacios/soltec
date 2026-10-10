import { Alert, Button, CircularProgress, TextField } from '@mui/material';
import type { components } from '@soltec/shared';
import { useState, type FormEvent } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { FormActions, FormPage } from '../../components/FormPage';
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
  // On their own account, anyone but an administrator changes only their name (the API enforces it too): email,
  // profiles, department and manager decide what they reach and how they sign in.
  const onlyName = isSelf && !(me?.roles.some((role) => role.code === 'admin') ?? false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFieldErrors({});
    setFailure(null);
    try {
      await update.mutateAsync(
        onlyName
          ? { version: user.version, name: name.trim() }
          : {
              version: user.version,
              name: name.trim(),
              email: email.trim(),
              role_ids: selected.map((role) => role.id),
              // Without permission to list departments the field is hidden; what is not sent stays as it was.
              ...(departmentChoices.canList ? { department_id: department?.id ?? null } : {}),
              manager_id: manager?.id ?? null,
            },
      );
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
      <FormPage onSubmit={(event) => void submit(event)}>
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
          disabled={onlyName}
        />
        {emailChanged && user.invitation_pending ? (
          <Alert severity="warning">
            Al cambiar el correo, el enlace de invitación ya enviado deja de servir. Después de
            guardar, reenvía la invitación desde la lista.
          </Alert>
        ) : null}
        <RoleSelect
          selected={selected}
          onChange={setSelected}
          error={fieldErrors.role_ids}
          disabled={onlyName}
        />
        <DepartmentSelect
          value={department}
          onChange={setDepartment}
          choices={departmentChoices}
          error={fieldErrors.department_id}
          disabled={onlyName}
        />
        <ManagerSelect
          value={manager}
          onChange={setManager}
          forUserId={user.id}
          error={fieldErrors.manager_id}
          disabled={onlyName}
        />
        {onlyName ? (
          <Alert severity="info">
            Estás editando tu propia cuenta: solo puedes cambiar tu nombre. Tu contraseña se cambia
            en «Cambiar contraseña»; lo demás lo cambia un administrador.
          </Alert>
        ) : isSelf ? (
          <Alert severity="info">
            Estás editando tu propia cuenta. Solo puedes cambiar tus perfiles si queda otro
            administrador activo.
          </Alert>
        ) : null}
        <FormActions>
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
              (!onlyName && departmentChoices.required && department === null)
            }
          >
            Guardar cambios
          </Button>
        </FormActions>
      </FormPage>
    </>
  );
}
