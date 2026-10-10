import {
  Alert,
  Button,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { ApiError } from '@soltec/shared';
import { useState, type FormEvent } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { FormActions } from '../../components/FormPage';
import { PageHeader } from '../../components/PageHeader';
import { fieldMessages, problemMessage } from './messages';
import {
  PermissionMatrix,
  toPayload,
  type MatrixScope,
  type MatrixValue,
} from './PermissionMatrix';
import { useCan } from './SessionContext';
import { useAccessCatalogs, useCreateRole, useRole, useUpdateRole } from './useRoles';

/** The order people expect to read the verbs in; any other verb a later module adds goes after them. */
const ACTION_ORDER = ['view', 'create', 'edit', 'deactivate'];

function byActionOrder(a: { code: string }, b: { code: string }): number {
  const rank = (code: string) => {
    const index = ACTION_ORDER.indexOf(code);
    return index === -1 ? ACTION_ORDER.length : index;
  };
  return rank(a.code) - rank(b.code) || a.code.localeCompare(b.code);
}

const EMPTY: MatrixValue = { permissions: {}, scopes: {} };
const SAVE_CONFLICTS = {
  conflict:
    'Otra persona cambió este perfil mientras lo editabas. Recarga la página para ver sus cambios.',
};

/** Create (`/perfiles/nuevo`) and edit (`/perfiles/:roleId`) of a role, with its permission matrix. */
export function RoleFormPage() {
  const { roleId } = useParams();
  const role = useRole(roleId);
  const catalogs = useAccessCatalogs();

  if (catalogs.resources.isError || catalogs.permissions.isError) {
    return (
      <Alert severity="error">
        {problemMessage(catalogs.resources.error ?? catalogs.permissions.error)}
      </Alert>
    );
  }
  if (role.isError) {
    return <Alert severity="error">{problemMessage(role.error)}</Alert>;
  }
  if (
    catalogs.resources.isPending ||
    catalogs.permissions.isPending ||
    (roleId !== undefined && role.isPending)
  ) {
    return <CircularProgress aria-label="Cargando el perfil" />;
  }

  return (
    <RoleForm
      // A different role (or a refetch after saving) restarts the form from the server's copy.
      key={`${role.data?.id ?? 'new'}:${role.data?.version ?? 0}`}
      role={role.data}
      resources={catalogs.resources.data.data}
      actions={[...catalogs.permissions.data.data].sort(byActionOrder)}
    />
  );
}

function matrixOf(
  role: { permissions: Record<string, string[]>; scopes: Record<string, string> } | undefined,
): MatrixValue {
  if (!role) {
    return EMPTY;
  }
  const scopes: Record<string, MatrixScope> = {};
  for (const [resource, scope] of Object.entries(role.scopes)) {
    if (scope === 'own' || scope === 'team' || scope === 'all') {
      scopes[resource] = scope;
    }
  }
  return { permissions: role.permissions, scopes };
}

interface RoleFormProps {
  role: Awaited<ReturnType<typeof useRole>['data']>;
  resources: { code: string; name: string }[];
  actions: { code: string; name: string }[];
}

function RoleForm({ role, resources, actions }: RoleFormProps) {
  const navigate = useNavigate();
  const can = useCan();
  const create = useCreateRole();
  const update = useUpdateRole(role?.id ?? '');
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [matrix, setMatrix] = useState<MatrixValue>(() => matrixOf(role));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);

  const isSystem = role?.is_system ?? false;
  const readOnly = isSystem || (role !== undefined && !can('roles', 'edit'));
  const saving = create.isPending || update.isPending;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFieldErrors({});
    setFailure(null);
    const { permissions, scopes } = toPayload(matrix);
    const details = {
      name: name.trim(),
      description: description.trim() === '' ? null : description.trim(),
    };
    try {
      if (role) {
        await update.mutateAsync({ version: role.version, ...details, permissions, scopes });
      } else {
        await create.mutateAsync({ ...details, user_type: 'internal', permissions, scopes });
      }
      navigate('/perfiles', { state: { flash: 'Perfil guardado.' } });
    } catch (error) {
      const fields = fieldMessages(error);
      setFieldErrors(fields);
      const general = problemMessage(error, SAVE_CONFLICTS);
      // A rejected cell of the matrix has no field of its own on screen: say it at the top.
      const matrixProblem = Object.keys(fields).some(
        (field) => field.startsWith('permissions') || field.startsWith('scopes'),
      );
      setFailure(
        Object.keys(fields).length === 0 || matrixProblem || !(error instanceof ApiError)
          ? general
          : null,
      );
    }
  };

  return (
    <>
      <PageHeader
        title={role ? (readOnly ? role.name : `Editar perfil: ${role.name}`) : 'Nuevo perfil'}
      />
      <Stack
        component="form"
        spacing={2.5}
        onSubmit={(event) => void submit(event)}
        noValidate
        sx={{ maxWidth: 900 }}
      >
        {isSystem ? (
          <Alert severity="info">
            Este perfil es de sistema: da acceso total y no se puede modificar.
          </Alert>
        ) : null}
        {failure ? <Alert severity="error">{failure}</Alert> : null}
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack spacing={2.5}>
            <TextField
              label="Nombre"
              value={name}
              onChange={(event) => setName(event.target.value)}
              error={Boolean(fieldErrors.name)}
              helperText={fieldErrors.name}
              disabled={readOnly}
              required
              fullWidth
              autoFocus={!role}
            />
            <TextField
              label="Descripción"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              error={Boolean(fieldErrors.description)}
              helperText={fieldErrors.description}
              disabled={readOnly}
              fullWidth
              multiline
              minRows={2}
            />
          </Stack>
        </Paper>
        <PermissionMatrix
          resources={resources}
          actions={actions}
          value={matrix}
          onChange={setMatrix}
          disabled={readOnly}
        />
        <Typography variant="body2" color="text.secondary">
          «Solo lo propio» limita a cada persona a sus propios registros (en Usuarios, a su propia
          cuenta). «Su equipo» suma los de quienes dependen de ella, directa o indirectamente, y los
          de su departamento. «Todo» le da acceso a los de todos.
        </Typography>
        <Alert severity="warning" variant="outlined">
          Dar permisos sobre «Usuarios» o «Perfiles» equivale casi a ser administrador: quien edite
          perfiles puede ampliar el suyo.
        </Alert>
        <FormActions>
          <Button variant="outlined" color="inherit" component={RouterLink} to="/perfiles">
            {readOnly ? 'Volver' : 'Cancelar'}
          </Button>
          {readOnly ? null : (
            <Button type="submit" variant="contained" disabled={saving || name.trim() === ''}>
              Guardar
            </Button>
          )}
        </FormActions>
      </Stack>
    </>
  );
}
