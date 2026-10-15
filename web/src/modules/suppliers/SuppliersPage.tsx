import AddIcon from '@mui/icons-material/Add';
import { Alert, Button } from '@mui/material';
import type { components } from '@soltec/shared';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ACTION_ICONS } from '../../components/actionIcons';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataList, type DataColumn } from '../../components/DataList';
import { FilterBar } from '../../components/FilterBar';
import { PageHeader } from '../../components/PageHeader';
import type { RowAction } from '../../components/RowActions';
import { ActiveBadge } from '../../components/StatusBadge';
import { StatusFilter } from '../../components/StatusFilter';
import { useListFilters } from '../../components/useListFilters';
import { problemMessage } from '../access/messages';
import { useCan } from '../access/SessionContext';
import { IDENTIFICATION_LABELS } from './identification';
import { useSetSupplierActive, useSuppliers } from './useSuppliers';

type Supplier = components['schemas']['SupplierSummary'];
const PER_PAGE = 25;

/** What the list shows in the identification column: «NIT 6647912-6», or a dash for none. */
export function identificationText(
  supplier: Pick<Supplier, 'identification_type' | 'identification'>,
) {
  return supplier.identification
    ? `${IDENTIFICATION_LABELS[supplier.identification_type]} ${supplier.identification}`
    : '—';
}

/** `/proveedores`: every supplier, for whoever may view the section (they have no owner or data scope). */
export function SuppliersPage() {
  const can = useCan();
  const filters = useListFilters();
  const [pending, setPending] = useState<{
    supplier: Supplier;
    activate: boolean;
    open: boolean;
  } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const suppliers = useSuppliers({
    q: filters.query,
    status: filters.status,
    page: filters.page + 1,
    per_page: PER_PAGE,
  });
  const setActive = useSetSupplierActive();

  const confirm = async () => {
    if (!pending) {
      return;
    }
    setFailure(null);
    try {
      await setActive.mutateAsync({ supplierId: pending.supplier.id, active: pending.activate });
    } catch (error) {
      setFailure(problemMessage(error));
    } finally {
      setPending({ ...pending, open: false });
    }
  };

  const actionsFor = (supplier: Supplier): RowAction[] => {
    const actions: RowAction[] = [];
    if (can('suppliers', 'edit')) {
      actions.push({
        key: 'edit',
        label: 'Editar',
        icon: ACTION_ICONS.edit,
        to: `/proveedores/${supplier.id}/editar`,
      });
    } else {
      actions.push({
        key: 'view',
        label: 'Ver',
        icon: ACTION_ICONS.view,
        to: `/proveedores/${supplier.id}`,
      });
    }
    if (can('suppliers', 'deactivate')) {
      actions.push({
        key: 'toggle',
        label: supplier.is_active ? 'Desactivar' : 'Reactivar',
        icon: supplier.is_active ? ACTION_ICONS.deactivate : ACTION_ICONS.reactivate,
        tone: supplier.is_active ? 'danger' : undefined,
        onSelect: () => setPending({ supplier, activate: !supplier.is_active, open: true }),
      });
    }
    return actions;
  };

  return (
    <>
      <PageHeader
        title="Proveedores"
        actions={
          can('suppliers', 'create') ? (
            <Button
              component={RouterLink}
              to="/proveedores/nuevo"
              variant="contained"
              startIcon={<AddIcon />}
            >
              Nuevo proveedor
            </Button>
          ) : null
        }
      />

      <FilterBar
        searchLabel="Buscar por nombre, razón social, identificación o código"
        search={filters.text}
        onSearchChange={filters.setText}
      >
        <StatusFilter value={filters.status} onChange={filters.setStatus} />
      </FilterBar>

      {failure ? (
        <Alert severity="error" onClose={() => setFailure(null)} sx={{ mb: 2 }}>
          {failure}
        </Alert>
      ) : null}

      <DataList
        label="Lista de proveedores"
        noun="proveedores"
        columns={COLUMNS}
        rows={suppliers.data?.data}
        error={suppliers.isError ? problemMessage(suppliers.error) : null}
        getRowId={(supplier) => supplier.id}
        getRowName={(supplier) => supplier.name}
        isInactive={(supplier) => !supplier.is_active}
        getActions={actionsFor}
        pagination={{
          page: filters.page,
          perPage: PER_PAGE,
          total: suppliers.data?.meta.total ?? 0,
          onPageChange: filters.setPage,
        }}
      />

      <ConfirmDialog
        open={pending?.open === true}
        title={pending?.activate ? 'Reactivar proveedor' : 'Desactivar proveedor'}
        message={
          pending?.activate
            ? `«${pending.supplier.name}» volverá a aparecer en las listas y a poder elegirse. Sus productos desactivados con él no se reactivan solos: se reactivan desde Productos.`
            : `«${pending?.supplier.name ?? ''}» dejará de aparecer en las listas activas y sus productos activos también se desactivarán. Sus datos y su identificación se conservan: para volver a registrarlo se reactiva este mismo proveedor.`
        }
        confirmLabel={pending?.activate ? 'Reactivar' : 'Desactivar'}
        destructive={pending?.activate === false}
        busy={setActive.isPending}
        onConfirm={() => void confirm()}
        onCancel={() => setPending(pending && { ...pending, open: false })}
      />
    </>
  );
}

const COLUMNS: DataColumn<Supplier>[] = [
  {
    id: 'name',
    header: 'Nombre',
    mobile: 'title',
    minWidth: 180,
    render: (supplier) => supplier.name,
  },
  {
    id: 'code',
    header: 'Código',
    mobile: 'subtitle',
    nowrap: true,
    render: (supplier) => supplier.code,
  },
  {
    id: 'legal_name',
    header: 'Razón social',
    mobile: 'meta',
    minWidth: 160,
    render: (supplier) => supplier.legal_name ?? '—',
  },
  {
    id: 'identification',
    header: 'Identificación',
    mobile: 'meta',
    nowrap: true,
    render: (supplier) => identificationText(supplier),
  },
  {
    id: 'credit',
    header: 'Crédito',
    mobile: 'meta',
    nowrap: true,
    render: (supplier) => (supplier.credit_days === null ? '—' : `${supplier.credit_days} días`),
  },
  {
    id: 'status',
    header: 'Estado',
    mobile: 'badge',
    nowrap: true,
    render: (supplier) => <ActiveBadge active={supplier.is_active} />,
  },
];
