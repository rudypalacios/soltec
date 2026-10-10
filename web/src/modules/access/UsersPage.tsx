import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import type { components } from '@soltec/shared';
import { useDeferredValue, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PageHeader } from '../../components/PageHeader';
import { useIsMobile } from '../../components/useIsMobile';
import { useDepartmentChoices } from '../organization/OrganizationFields';
import { formatMoment } from './formatting';
import { problemMessage } from './messages';
import { useCan, useCurrentUser } from './SessionContext';
import { useResendInvitation, useSetUserActive, useUsers } from './useUsers';
import { StatusFilter, type StatusValue } from './StatusFilter';

type User = components['schemas']['User'];
const PER_PAGE = 25;

/** What a row can do. `edit` and `invite` act at once; `activate` and `deactivate` ask for confirmation first. */
type RowAction =
  | { kind: 'edit'; label: string; to: string }
  | { kind: 'invite'; label: string }
  | { kind: 'toggle'; label: string; activate: boolean };

const ACTIVE_CONFLICTS = {
  last_admin: 'No se puede: debe quedar al menos un administrador activo.',
  forbidden:
    'No tienes permiso para cambiar a este usuario (por ejemplo, a un administrador, o a ti mismo).',
};

export function UsersPage() {
  const isMobile = useIsMobile();
  const can = useCan();
  const me = useCurrentUser();
  const [text, setText] = useState('');
  const deferredText = useDeferredValue(text);
  const [status, setStatus] = useState<StatusValue>('active');
  const [page, setPage] = useState(0);
  // In the address, so the link from a department ("Ver sus usuarios") opens the list already filtered.
  const [searchParams, setSearchParams] = useSearchParams();
  const departmentId = searchParams.get('departamento') ?? '';
  const departmentChoices = useDepartmentChoices();
  const [pending, setPending] = useState<{ user: User; activate: boolean } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const users = useUsers({
    q: deferredText.trim() || undefined,
    status,
    department_id: departmentId || undefined,
    page: page + 1,
    per_page: PER_PAGE,
  });
  const setActive = useSetUserActive();
  const resend = useResendInvitation();

  const actionsFor = (user: User): RowAction[] => {
    const actions: RowAction[] = [];
    if (can('users', 'edit')) {
      actions.push({ kind: 'edit', label: 'Editar', to: `/usuarios/${user.id}/editar` });
      if (user.invitation_pending) {
        actions.push({ kind: 'invite', label: 'Reenviar invitación' });
      }
    }
    if (can('users', 'deactivate') && user.id !== me?.id) {
      actions.push(
        user.is_active
          ? { kind: 'toggle', label: 'Desactivar', activate: false }
          : { kind: 'toggle', label: 'Reactivar', activate: true },
      );
    }
    return actions;
  };

  const run = async (user: User, action: RowAction) => {
    if (action.kind === 'toggle') {
      setPending({ user, activate: action.activate });
    } else if (action.kind === 'invite') {
      setActionError(null);
      setNotice(null);
      try {
        await resend.mutateAsync(user.id);
        setNotice(`Enviamos la invitación a ${user.email}. El enlace anterior ya no sirve.`);
      } catch (error) {
        setActionError(problemMessage(error));
      }
    }
  };

  const confirm = async () => {
    if (!pending) {
      return;
    }
    setActionError(null);
    try {
      await setActive.mutateAsync({ userId: pending.user.id, active: pending.activate });
    } catch (error) {
      setActionError(problemMessage(error, ACTIVE_CONFLICTS));
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Usuarios"
        actions={
          can('users', 'create') ? (
            <Button
              component={RouterLink}
              to="/usuarios/nuevo"
              variant="contained"
              startIcon={<AddIcon />}
            >
              Nuevo usuario
            </Button>
          ) : null
        }
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          label="Buscar por nombre o correo"
          type="search"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setPage(0);
          }}
          sx={{ flexGrow: 1, maxWidth: { sm: 360 } }}
        />
        {departmentChoices.canList ? (
          <TextField
            select
            label="Departamento"
            value={departmentId}
            onChange={(event) => {
              setSearchParams(event.target.value ? { departamento: event.target.value } : {});
              setPage(0);
            }}
            sx={{ minWidth: { sm: 200 } }}
          >
            <MenuItem value="">Todos</MenuItem>
            {/* A filter from a link may point at a department that is no longer active. */}
            {departmentId && !departmentChoices.options.some((d) => d.id === departmentId) ? (
              <MenuItem value={departmentId}>Departamento inactivo</MenuItem>
            ) : null}
            {departmentChoices.options.map((department) => (
              <MenuItem key={department.id} value={department.id}>
                {department.name}
              </MenuItem>
            ))}
          </TextField>
        ) : null}
        <StatusFilter
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(0);
          }}
        />
      </Stack>

      {actionError ? (
        <Alert severity="error" onClose={() => setActionError(null)} sx={{ mb: 2 }}>
          {actionError}
        </Alert>
      ) : null}
      {notice ? (
        <Alert severity="success" onClose={() => setNotice(null)} sx={{ mb: 2 }}>
          {notice}
        </Alert>
      ) : null}

      {users.isPending ? (
        <CircularProgress aria-label="Cargando usuarios" />
      ) : users.isError ? (
        <Alert severity="error">{problemMessage(users.error)}</Alert>
      ) : users.data.data.length === 0 ? (
        <Alert severity="info">No hay usuarios con esos filtros.</Alert>
      ) : isMobile ? (
        <Stack spacing={1.5} aria-label="Lista de usuarios">
          {users.data.data.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              actions={actionsFor(user)}
              onAction={(action) => void run(user, action)}
            />
          ))}
        </Stack>
      ) : (
        <UsersTable
          users={users.data.data}
          actionsFor={actionsFor}
          onAction={(user, action) => void run(user, action)}
        />
      )}

      {users.data ? (
        <TablePagination
          component="div"
          count={users.data.meta.total}
          page={page}
          onPageChange={(_, next) => setPage(next)}
          rowsPerPage={PER_PAGE}
          rowsPerPageOptions={[]}
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
          sx={{ '.MuiTablePagination-toolbar': { px: 0 } }}
        />
      ) : null}

      <ConfirmDialog
        open={pending !== null}
        title={pending?.activate ? 'Reactivar usuario' : 'Desactivar usuario'}
        message={
          pending?.activate
            ? `${pending.user.name} podrá iniciar sesión de nuevo.`
            : `${pending?.user.name ?? ''} no podrá iniciar sesión y se cerrarán todas sus sesiones. Sus datos se conservan.`
        }
        confirmLabel={pending?.activate ? 'Reactivar' : 'Desactivar'}
        busy={setActive.isPending}
        onConfirm={() => void confirm()}
        onCancel={() => setPending(null)}
      />
    </>
  );
}

function StatusChip({ user }: { user: User }) {
  if (user.is_active && user.invitation_pending) {
    return <Chip size="small" color="warning" variant="outlined" label="Invitación pendiente" />;
  }
  return user.is_active ? (
    <Chip size="small" color="success" variant="outlined" label="Activo" />
  ) : (
    <Chip size="small" label="Inactivo" />
  );
}

function RoleChips({ user }: { user: User }) {
  return (
    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
      {user.roles.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Sin perfil
        </Typography>
      ) : (
        user.roles.map((role) => <Chip key={role.id} size="small" label={role.name} />)
      )}
    </Box>
  );
}

function UsersTable({
  users,
  actionsFor,
  onAction,
}: {
  users: User[];
  actionsFor: (user: User) => RowAction[];
  onAction: (user: User, action: RowAction) => void;
}) {
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" aria-label="Lista de usuarios">
        <TableHead>
          <TableRow>
            <TableCell>Nombre</TableCell>
            <TableCell>Correo</TableCell>
            <TableCell>Perfiles</TableCell>
            <TableCell>Departamento</TableCell>
            <TableCell>Estado</TableCell>
            <TableCell>Último acceso</TableCell>
            <TableCell align="right" sx={{ width: 56 }}>
              <span style={{ position: 'absolute', left: -9999 }}>Acciones</span>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {users.map((user) => {
            const actions = actionsFor(user);
            return (
              <TableRow key={user.id} hover>
                <TableCell>{user.name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <RoleChips user={user} />
                </TableCell>
                <TableCell>
                  {user.department?.name ?? (
                    <Typography variant="body2" color="text.secondary">
                      Sin departamento
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <StatusChip user={user} />
                </TableCell>
                <TableCell>{formatMoment(user.last_login_at)}</TableCell>
                <TableCell align="right">
                  {actions.length > 0 ? (
                    <RowMenu
                      label={`Acciones de ${user.name}`}
                      actions={actions}
                      onAction={(action) => onAction(user, action)}
                    />
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function RowMenu({
  label,
  actions,
  onAction,
}: {
  label: string;
  actions: RowAction[];
  onAction: (action: RowAction) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <IconButton aria-label={label} onClick={(event) => setAnchor(event.currentTarget)}>
        <MoreVertIcon />
      </IconButton>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        {actions.map((action) =>
          action.kind === 'edit' ? (
            <MenuItem key={action.kind} component={RouterLink} to={action.to}>
              {action.label}
            </MenuItem>
          ) : (
            <MenuItem
              key={action.kind}
              onClick={() => {
                setAnchor(null);
                onAction(action);
              }}
            >
              {action.label}
            </MenuItem>
          ),
        )}
      </Menu>
    </>
  );
}

function UserCard({
  user,
  actions,
  onAction,
}: {
  user: User;
  actions: RowAction[];
  onAction: (action: RowAction) => void;
}) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ '&:last-child': { pb: 2 } }}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 600 }}>{user.name}</Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {user.email}
            </Typography>
          </Box>
          <StatusChip user={user} />
        </Stack>
        <Box sx={{ mt: 1.5 }}>
          <RoleChips user={user} />
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {user.department ? `${user.department.name} · ` : ''}Último acceso:{' '}
          {formatMoment(user.last_login_at)}
        </Typography>
        {actions.length > 0 ? (
          <Stack direction="row" sx={{ mt: 1, ml: -1, flexWrap: 'wrap' }}>
            {actions.map((action) => (
              <Button
                key={action.kind}
                size="small"
                color={action.kind === 'toggle' && !action.activate ? 'error' : 'primary'}
                {...(action.kind === 'edit'
                  ? { component: RouterLink, to: action.to }
                  : { onClick: () => onAction(action) })}
                aria-label={`${action.label}: ${user.name}`}
                sx={{ minHeight: 44 }}
              >
                {action.label}
              </Button>
            ))}
          </Stack>
        ) : null}
      </CardContent>
    </Card>
  );
}
