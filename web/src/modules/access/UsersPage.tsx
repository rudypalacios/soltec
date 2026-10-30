import AddIcon from '@mui/icons-material/Add';
import { Alert, Box, Button, Chip, MenuItem, TextField, Typography } from '@mui/material';
import { ApiError, type components } from '@soltec/shared';
import { useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { ACTION_ICONS } from '../../components/actionIcons';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataList, type DataColumn } from '../../components/DataList';
import { FilterBar } from '../../components/FilterBar';
import { PageHeader } from '../../components/PageHeader';
import type { RowAction } from '../../components/RowActions';
import { ActiveBadge, StatusBadge } from '../../components/StatusBadge';
import { StatusFilter } from '../../components/StatusFilter';
import { useListFilters } from '../../components/useListFilters';
import { useDepartmentChoices } from '../organization/OrganizationFields';
import { formatMoment, formatUntil } from './formatting';
import { problemMessage } from './messages';
import { useCan, useCurrentUser } from './SessionContext';
import { useResendInvitation, useSetUserActive, useUnlockUser, useUsers } from './useUsers';

type User = components['schemas']['User'];
const PER_PAGE = 25;

const ACTIVE_CONFLICTS = {
  last_admin: 'No se puede: debe quedar al menos un administrador activo.',
  forbidden:
    'No tienes permiso para cambiar a este usuario (por ejemplo, a un administrador, o a ti mismo).',
};

/** Why a user with clients cannot be deactivated, with the count the API sends back. */
function clientsToHandOver(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.code !== 'user_has_clients') {
    return null;
  }
  const count = error.details.active_client_count;
  const clients =
    typeof count === 'number'
      ? count === 1
        ? '1 cliente activo'
        : `${count} clientes activos`
      : 'clientes activos';
  return `No se puede desactivar: es el asesor responsable de ${clients}. Reasigna su cartera en Clientes primero.`;
}

export function UsersPage() {
  const can = useCan();
  const me = useCurrentUser();
  const filters = useListFilters();
  // In the address, so the link from a department ("Ver sus usuarios") opens the list already filtered.
  const [searchParams, setSearchParams] = useSearchParams();
  const departmentId = searchParams.get('departamento') ?? '';
  const departmentChoices = useDepartmentChoices();
  const [pending, setPending] = useState<{ user: User; activate: boolean } | null>(null);
  const [pendingResend, setPendingResend] = useState<User | null>(null);
  const [pendingUnlock, setPendingUnlock] = useState<User | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const users = useUsers({
    q: filters.query,
    status: filters.status,
    department_id: departmentId || undefined,
    page: filters.page + 1,
    per_page: PER_PAGE,
  });
  const setActive = useSetUserActive();
  const resend = useResendInvitation();
  const unlock = useUnlockUser();

  const resendInvitation = async () => {
    if (!pendingResend) {
      return;
    }
    setActionError(null);
    setNotice(null);
    try {
      await resend.mutateAsync(pendingResend.id);
      setNotice(`Enviamos la invitación a ${pendingResend.email}. El enlace anterior ya no sirve.`);
    } catch (error) {
      setActionError(problemMessage(error));
    } finally {
      setPendingResend(null);
    }
  };

  const unlockUser = async () => {
    if (!pendingUnlock) {
      return;
    }
    setActionError(null);
    setNotice(null);
    try {
      await unlock.mutateAsync(pendingUnlock.id);
      setNotice(`${pendingUnlock.name} ya puede iniciar sesión de nuevo.`);
    } catch (error) {
      setActionError(problemMessage(error));
    } finally {
      setPendingUnlock(null);
    }
  };

  const actionsFor = (user: User): RowAction[] => {
    const actions: RowAction[] = [];
    if (can('users', 'edit')) {
      actions.push({
        key: 'edit',
        label: 'Editar',
        icon: ACTION_ICONS.edit,
        to: `/usuarios/${user.id}/editar`,
      });
      if (user.locked_until) {
        actions.push({
          key: 'unlock',
          label: 'Desbloquear',
          icon: ACTION_ICONS.unlock,
          onSelect: () => setPendingUnlock(user),
        });
      }
      if (user.invitation_pending) {
        actions.push({
          key: 'invite',
          label: 'Reenviar invitación',
          icon: ACTION_ICONS.resend,
          onSelect: () => setPendingResend(user),
        });
      }
    }
    if (can('users', 'deactivate') && user.id !== me?.id) {
      actions.push({
        key: 'toggle',
        label: user.is_active ? 'Desactivar' : 'Reactivar',
        icon: user.is_active ? ACTION_ICONS.deactivate : ACTION_ICONS.reactivate,
        tone: user.is_active ? 'danger' : undefined,
        onSelect: () => setPending({ user, activate: !user.is_active }),
      });
    }
    return actions;
  };

  const confirm = async () => {
    if (!pending) {
      return;
    }
    setActionError(null);
    try {
      await setActive.mutateAsync({ userId: pending.user.id, active: pending.activate });
    } catch (error) {
      setActionError(clientsToHandOver(error) ?? problemMessage(error, ACTIVE_CONFLICTS));
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Usuarios"
        actions={
          // `own` (also the default without a scope) reaches nobody else: the API refuses to create anyone with it.
          can('users', 'create') && (me?.scopes.users ?? 'own') !== 'own' ? (
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

      <FilterBar
        searchLabel="Buscar por nombre o correo"
        search={filters.text}
        onSearchChange={filters.setText}
      >
        {departmentChoices.canList ? (
          <TextField
            select
            label="Departamento"
            value={departmentId}
            onChange={(event) => {
              setSearchParams(event.target.value ? { departamento: event.target.value } : {});
              filters.resetPage();
            }}
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
        <StatusFilter value={filters.status} onChange={filters.setStatus} />
      </FilterBar>

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

      <DataList
        label="Lista de usuarios"
        noun="usuarios"
        columns={COLUMNS}
        rows={users.data?.data}
        error={users.isError ? problemMessage(users.error) : null}
        getRowId={(user) => user.id}
        getRowName={(user) => user.name}
        isInactive={(user) => !user.is_active}
        getActions={actionsFor}
        pagination={{
          page: filters.page,
          perPage: PER_PAGE,
          total: users.data?.meta.total ?? 0,
          onPageChange: filters.setPage,
        }}
      />

      <ConfirmDialog
        open={pending !== null}
        title={pending?.activate ? 'Reactivar usuario' : 'Desactivar usuario'}
        message={
          pending?.activate
            ? `${pending.user.name} podrá iniciar sesión de nuevo.`
            : `${pending?.user.name ?? ''} no podrá iniciar sesión y se cerrarán todas sus sesiones. Sus datos se conservan.`
        }
        confirmLabel={pending?.activate ? 'Reactivar' : 'Desactivar'}
        destructive={pending?.activate === false}
        busy={setActive.isPending}
        onConfirm={() => void confirm()}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={pendingUnlock !== null}
        title="Desbloquear usuario"
        message={`${pendingUnlock?.name ?? ''} podrá iniciar sesión de nuevo sin esperar a que termine el bloqueo.`}
        confirmLabel="Desbloquear"
        busy={unlock.isPending}
        onConfirm={() => void unlockUser()}
        onCancel={() => setPendingUnlock(null)}
      />
      <ConfirmDialog
        open={pendingResend !== null}
        title="Reenviar invitación"
        message={`Enviaremos una invitación nueva a ${pendingResend?.email ?? ''}. El enlace anterior dejará de funcionar.`}
        confirmLabel="Reenviar"
        busy={resend.isPending}
        onConfirm={() => void resendInvitation()}
        onCancel={() => setPendingResend(null)}
      />
    </>
  );
}

function StatusCell({ user }: { user: User }) {
  if (user.is_active && user.locked_until) {
    // Two short lines: one long badge would take the whole width of a card and squeeze the name out.
    return (
      <Box>
        <StatusBadge tone="warning" label="Bloqueado" />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          hasta {formatUntil(user.locked_until)}
        </Typography>
      </Box>
    );
  }
  return user.is_active && user.invitation_pending ? (
    <StatusBadge tone="warning" label="Invitación pendiente" />
  ) : (
    <ActiveBadge active={user.is_active} />
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

const COLUMNS: DataColumn<User>[] = [
  { id: 'name', header: 'Nombre', mobile: 'title', minWidth: 160, render: (user) => user.name },
  { id: 'email', header: 'Correo', mobile: 'subtitle', render: (user) => user.email },
  {
    id: 'roles',
    header: 'Perfiles',
    mobile: 'meta',
    mobileLabel: false,
    render: (user) => <RoleChips user={user} />,
  },
  {
    id: 'department',
    header: 'Departamento',
    mobile: 'meta',
    render: (user) =>
      user.department?.name ?? (
        <Typography component="span" variant="body2" color="text.secondary">
          Sin asignar
        </Typography>
      ),
  },
  {
    id: 'status',
    header: 'Estado',
    mobile: 'badge',
    nowrap: true,
    render: (user) => <StatusCell user={user} />,
  },
  {
    id: 'last_login',
    header: 'Último acceso',
    mobile: 'meta',
    render: (user) => formatMoment(user.last_login_at),
  },
];
