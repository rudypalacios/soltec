import AddIcon from '@mui/icons-material/Add';
import { Alert, Button, Chip, Snackbar } from '@mui/material';
import type { components } from '@soltec/shared';
import { useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { ACTION_ICONS } from '../../components/actionIcons';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataList, type DataColumn } from '../../components/DataList';
import { FilterBar } from '../../components/FilterBar';
import { PageHeader } from '../../components/PageHeader';
import type { RowAction } from '../../components/RowActions';
import { ActiveBadge } from '../../components/StatusBadge';
import { StatusFilter } from '../../components/StatusFilter';
import { useListFilters } from '../../components/useListFilters';
import { problemMessage } from './messages';
import { useCan } from './SessionContext';
import { useRoles, useSetRoleActive } from './useRoles';

type Role = components['schemas']['Role'];
const PER_PAGE = 25;

const ACTIVE_CONFLICTS = {
  conflict:
    'No se puede desactivar: hay usuarios activos con este perfil. Cámbiales el perfil primero.',
};

const COLUMNS: DataColumn<Role>[] = [
  { id: 'name', header: 'Nombre', mobile: 'title', minWidth: 160, render: (role) => role.name },
  {
    id: 'description',
    header: 'Descripción',
    mobile: 'subtitle',
    render: (role) => role.description ?? '',
  },
  {
    id: 'type',
    header: 'Tipo',
    mobile: 'meta',
    nowrap: true,
    render: (role) => (role.is_system ? <Chip size="small" label="Sistema" /> : 'Personalizado'),
  },
  {
    id: 'status',
    header: 'Estado',
    mobile: 'badge',
    nowrap: true,
    render: (role) => <ActiveBadge active={role.is_active} />,
  },
];

export function RolesPage() {
  const can = useCan();
  const location = useLocation();
  const filters = useListFilters();
  const [pending, setPending] = useState<{ role: Role; activate: boolean } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(() => {
    const message = (location.state as { flash?: unknown } | null)?.flash;
    return typeof message === 'string' ? message : null;
  });

  const roles = useRoles({
    q: filters.query,
    status: filters.status,
    page: filters.page + 1,
    per_page: PER_PAGE,
  });
  const setActive = useSetRoleActive();

  const confirm = async () => {
    if (!pending) {
      return;
    }
    setActionError(null);
    try {
      await setActive.mutateAsync({ roleId: pending.role.id, active: pending.activate });
    } catch (error) {
      setActionError(problemMessage(error, ACTIVE_CONFLICTS));
    } finally {
      setPending(null);
    }
  };

  const canDeactivate = can('roles', 'deactivate');
  const canEdit = can('roles', 'edit');

  const actionsFor = (role: Role): RowAction[] => {
    const editable = canEdit && !role.is_system;
    const actions: RowAction[] = [
      {
        key: 'open',
        label: editable ? 'Editar' : 'Ver',
        icon: editable ? ACTION_ICONS.edit : ACTION_ICONS.view,
        to: `/perfiles/${role.id}`,
      },
    ];
    if (canDeactivate && !role.is_system) {
      actions.push({
        key: 'toggle',
        label: role.is_active ? 'Desactivar' : 'Reactivar',
        icon: role.is_active ? ACTION_ICONS.deactivate : ACTION_ICONS.reactivate,
        tone: role.is_active ? 'danger' : undefined,
        onSelect: () => setPending({ role, activate: !role.is_active }),
      });
    }
    return actions;
  };

  return (
    <>
      <PageHeader
        title="Perfiles"
        actions={
          can('roles', 'create') ? (
            <Button
              component={RouterLink}
              to="/perfiles/nuevo"
              variant="contained"
              startIcon={<AddIcon />}
            >
              Nuevo perfil
            </Button>
          ) : null
        }
      />

      <FilterBar
        searchLabel="Buscar por nombre"
        search={filters.text}
        onSearchChange={filters.setText}
      >
        <StatusFilter value={filters.status} onChange={filters.setStatus} />
      </FilterBar>

      {actionError ? (
        <Alert severity="error" onClose={() => setActionError(null)} sx={{ mb: 2 }}>
          {actionError}
        </Alert>
      ) : null}

      <DataList
        label="Lista de perfiles"
        noun="perfiles"
        columns={COLUMNS}
        rows={roles.data?.data}
        error={roles.isError ? problemMessage(roles.error) : null}
        getRowId={(role) => role.id}
        getRowName={(role) => role.name}
        getActions={actionsFor}
        pagination={{
          page: filters.page,
          perPage: PER_PAGE,
          total: roles.data?.meta.total ?? 0,
          onPageChange: filters.setPage,
        }}
      />

      <ConfirmDialog
        open={pending !== null}
        title={pending?.activate ? 'Reactivar perfil' : 'Desactivar perfil'}
        message={
          pending?.activate
            ? `El perfil «${pending.role.name}» podrá asignarse de nuevo.`
            : `El perfil «${pending?.role.name ?? ''}» dejará de poder asignarse. Sus datos se conservan.`
        }
        confirmLabel={pending?.activate ? 'Reactivar' : 'Desactivar'}
        destructive={pending?.activate === false}
        busy={setActive.isPending}
        onConfirm={() => void confirm()}
        onCancel={() => setPending(null)}
      />
      <Snackbar
        open={flash !== null}
        autoHideDuration={4000}
        onClose={() => setFlash(null)}
        message={flash}
      />
    </>
  );
}
