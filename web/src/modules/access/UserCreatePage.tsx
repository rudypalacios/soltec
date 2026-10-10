import { Alert, Autocomplete, Button, Chip, Paper, Stack, TextField } from '@mui/material';
import type { components } from '@soltec/shared';
import { useState, type FormEvent } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import {
  DepartmentSelect,
  ManagerSelect,
  useDepartmentChoices,
  type NamedRef,
} from '../organization/OrganizationFields';
import { fieldMessages, problemMessage } from './messages';
import { useCurrentUser } from './SessionContext';
import { useCreateUser } from './useUsers';
import { useRoles } from './useRoles';

type User = components['schemas']['UserCreated'];
/** What a profile selector needs from a role; both the roles list and a user's own roles have it. */
export type RoleChoice = Pick<components['schemas']['Role'], 'id' | 'name'>;

/** Shared by the create and edit screens. */
export const USER_FIELD_MESSAGES = {
  role_ids: { not_found: 'Algún perfil ya no existe o está inactivo.' },
  department_id: {
    not_found: 'El departamento ya no existe o está inactivo.',
    out_of_scope: 'Queda fuera de tu equipo.',
  },
  manager_id: {
    not_found: 'Esa persona ya no está activa.',
    invalid: 'Nadie puede ser su propio jefe.',
    out_of_scope:
      'Con tu alcance, esta persona debe quedar en tu departamento o depender de ti o de alguien de tu equipo.',
  },
};

export function UserCreatePage() {
  const create = useCreateUser();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [selected, setSelected] = useState<RoleChoice[]>([]);
  const [department, setDepartment] = useState<NamedRef | null>(null);
  const me = useCurrentUser();
  // Whoever reaches only their team starts with themselves as the manager, so the new user lands inside it.
  const defaultManager: NamedRef | null =
    me && me.scopes.users === 'team' ? { id: me.id, name: me.name } : null;
  const [manager, setManager] = useState<NamedRef | null>(defaultManager);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [created, setCreated] = useState<User | null>(null);
  const departmentChoices = useDepartmentChoices();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFieldErrors({});
    setFailure(null);
    try {
      setCreated(
        await create.mutateAsync({
          name: name.trim(),
          email: email.trim(),
          role_ids: selected.map((role) => role.id),
          department_id: department?.id ?? null,
          manager_id: manager?.id ?? null,
        }),
      );
    } catch (error) {
      const fields = fieldMessages(error, USER_FIELD_MESSAGES);
      setFieldErrors(fields);
      setFailure(Object.keys(fields).length === 0 ? problemMessage(error) : null);
    }
  };

  const startAnother = () => {
    setCreated(null);
    setName('');
    setEmail('');
    setSelected([]);
    setDepartment(null);
    setManager(defaultManager);
  };

  if (created) {
    return (
      <>
        <PageHeader title="Usuario creado" />
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 560 }}>
          <Stack spacing={2.5}>
            {created.invitation_sent ? (
              <Alert severity="success">
                Enviamos la invitación a {created.email}. {created.name} elegirá su contraseña con
                el enlace del correo, que vence en 72 horas.
              </Alert>
            ) : (
              <Alert severity="warning">
                El usuario se creó, pero el correo no pudo salir. Reenvía la invitación desde la
                lista de usuarios cuando el correo del servidor funcione.
              </Alert>
            )}
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
            helperText={
              fieldErrors.email ?? 'Aquí llegará la invitación para elegir su contraseña.'
            }
            required
            fullWidth
          />
          <RoleSelect selected={selected} onChange={setSelected} error={fieldErrors.role_ids} />
          <DepartmentSelect
            value={department}
            onChange={setDepartment}
            choices={departmentChoices}
            error={fieldErrors.department_id}
          />
          <ManagerSelect value={manager} onChange={setManager} error={fieldErrors.manager_id} />
          <Stack direction={{ xs: 'column-reverse', sm: 'row' }} spacing={1}>
            <Button component={RouterLink} to="/usuarios">
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={
                create.isPending ||
                !name ||
                !email ||
                selected.length === 0 ||
                (departmentChoices.required && department === null)
              }
            >
              Crear y enviar invitación
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </>
  );
}

/** The profiles of a user: shared by the create and edit screens. */
export function RoleSelect({
  selected,
  onChange,
  error,
}: {
  selected: RoleChoice[];
  onChange: (roles: RoleChoice[]) => void;
  error?: string;
}) {
  // Active internal roles. 100 is the most the API returns per page: more than that is not a realistic list of roles.
  const roles = useRoles({ status: 'active', user_type: 'internal', per_page: 100 });
  return (
    <Autocomplete
      multiple
      options={roles.data?.data ?? []}
      loading={roles.isPending}
      value={selected}
      onChange={(_, value) => onChange(value)}
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
          error={Boolean(error)}
          helperText={error ?? 'Define a qué pantallas y acciones tendrá acceso.'}
        />
      )}
    />
  );
}
