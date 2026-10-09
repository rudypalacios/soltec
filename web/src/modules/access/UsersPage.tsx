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
import { Link as RouterLink } from 'react-router-dom';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PageHeader } from '../../components/PageHeader';
import { useIsMobile } from '../../components/useIsMobile';
import { formatMoment } from './formatting';
import { problemMessage } from './messages';
import { useCan, useCurrentUser } from './SessionContext';
import { useSetUserActive, useUsers } from './useUsers';
import { StatusFilter, type StatusValue } from './StatusFilter';

type User = components['schemas']['User'];
const PER_PAGE = 25;

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
  const [pending, setPending] = useState<{ user: User; activate: boolean } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const users = useUsers({
    q: deferredText.trim() || undefined,
    status,
    page: page + 1,
    per_page: PER_PAGE,
  });
  const setActive = useSetUserActive();

  const canDeactivate = can('users', 'deactivate');
  const actionsFor = (user: User): { label: string; activate: boolean } | null => {
    if (!canDeactivate || user.id === me?.id) {
      return null;
    }
    return user.is_active
      ? { label: 'Desactivar', activate: false }
      : { label: 'Reactivar', activate: true };
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
              action={actionsFor(user)}
              onAction={(activate) => setPending({ user, activate })}
            />
          ))}
        </Stack>
      ) : (
        <UsersTable
          users={users.data.data}
          actionsFor={actionsFor}
          onAction={(user, activate) => setPending({ user, activate })}
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
  actionsFor: (user: User) => { label: string; activate: boolean } | null;
  onAction: (user: User, activate: boolean) => void;
}) {
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" aria-label="Lista de usuarios">
        <TableHead>
          <TableRow>
            <TableCell>Nombre</TableCell>
            <TableCell>Correo</TableCell>
            <TableCell>Perfiles</TableCell>
            <TableCell>Estado</TableCell>
            <TableCell>Último acceso</TableCell>
            <TableCell align="right" sx={{ width: 56 }}>
              <span style={{ position: 'absolute', left: -9999 }}>Acciones</span>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {users.map((user) => {
            const action = actionsFor(user);
            return (
              <TableRow key={user.id} hover>
                <TableCell>{user.name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <RoleChips user={user} />
                </TableCell>
                <TableCell>
                  <StatusChip user={user} />
                </TableCell>
                <TableCell>{formatMoment(user.last_login_at)}</TableCell>
                <TableCell align="right">
                  {action ? (
                    <RowMenu
                      label={`Acciones de ${user.name}`}
                      action={action}
                      onAction={() => onAction(user, action.activate)}
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
  action,
  onAction,
}: {
  label: string;
  action: { label: string };
  onAction: () => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <IconButton aria-label={label} onClick={(event) => setAnchor(event.currentTarget)}>
        <MoreVertIcon />
      </IconButton>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        <MenuItem
          onClick={() => {
            setAnchor(null);
            onAction();
          }}
        >
          {action.label}
        </MenuItem>
      </Menu>
    </>
  );
}

function UserCard({
  user,
  action,
  onAction,
}: {
  user: User;
  action: { label: string; activate: boolean } | null;
  onAction: (activate: boolean) => void;
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
          Último acceso: {formatMoment(user.last_login_at)}
        </Typography>
        {action ? (
          <Button
            size="small"
            color={action.activate ? 'primary' : 'error'}
            onClick={() => onAction(action.activate)}
            aria-label={`${action.label} a ${user.name}`}
            sx={{ mt: 1, ml: -1 }}
          >
            {action.label}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
