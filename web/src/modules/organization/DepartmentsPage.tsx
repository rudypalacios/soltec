import AddIcon from '@mui/icons-material/Add';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  Stack,
  TextField,
} from '@mui/material';
import { ApiError, type components } from '@soltec/shared';
import { useState, type FormEvent } from 'react';
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
import { fieldMessages, problemMessage } from '../access/messages';
import { useCan } from '../access/SessionContext';
import { touchQuery } from '../../theme/tokens';
import { useDepartments, useSaveDepartment, useSetDepartmentActive } from './useDepartments';

type Department = components['schemas']['Department'];
const PER_PAGE = 25;

/** The path of the users list filtered by a department; the list reads it from the query string. */
export function usersOfDepartmentPath(departmentId: string): string {
  return `/usuarios?departamento=${encodeURIComponent(departmentId)}`;
}

export function activeUsersLabel(count: number): string {
  return count === 1 ? '1 usuario activo' : `${count} usuarios activos`;
}

/** Why a department could not be deactivated, with the count the API sends back. */
export function inUseMessage(name: string, error: unknown): string | null {
  if (!(error instanceof ApiError) || error.code !== 'department_in_use') {
    return null;
  }
  const count = error.details.active_user_count;
  const users = typeof count === 'number' ? activeUsersLabel(count) : 'usuarios activos';
  return `No se puede desactivar «${name}»: tiene ${users}. Asígnalos a otro departamento primero.`;
}

type Failure = { message: string; departmentId?: string };

/** `/departamentos`: list, create, rename, deactivate and reactivate departments. */
export function DepartmentsPage() {
  const can = useCan();
  const filters = useListFilters();
  const [editing, setEditing] = useState<Department | 'new' | null>(null);
  // Kept after closing (`open` false) so the dialog does not lose its text while it fades out.
  const [pending, setPending] = useState<{
    department: Department;
    activate: boolean;
    open: boolean;
  } | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

  const departments = useDepartments({
    q: filters.query,
    status: filters.status,
    page: filters.page + 1,
    per_page: PER_PAGE,
  });
  const setActive = useSetDepartmentActive();

  const confirm = async () => {
    if (!pending) {
      return;
    }
    const { department, activate } = pending;
    setFailure(null);
    try {
      await setActive.mutateAsync({ departmentId: department.id, active: activate });
    } catch (error) {
      const inUse = inUseMessage(department.name, error);
      setFailure(
        inUse
          ? { message: inUse, departmentId: department.id }
          : {
              message: problemMessage(error, {
                validation_failed: `Ya hay un departamento activo llamado «${department.name}».`,
              }),
            },
      );
    } finally {
      setPending({ ...pending, open: false });
    }
  };

  const actionsFor = (department: Department): RowAction[] => {
    const actions: RowAction[] = [];
    if (can('departments', 'edit')) {
      actions.push({
        key: 'rename',
        label: 'Renombrar',
        icon: ACTION_ICONS.rename,
        onSelect: () => setEditing(department),
      });
    }
    if (can('departments', 'deactivate')) {
      actions.push({
        key: 'toggle',
        label: department.is_active ? 'Desactivar' : 'Reactivar',
        icon: department.is_active ? ACTION_ICONS.deactivate : ACTION_ICONS.reactivate,
        tone: department.is_active ? 'danger' : undefined,
        onSelect: () => setPending({ department, activate: !department.is_active, open: true }),
      });
    }
    return actions;
  };

  return (
    <>
      <PageHeader
        title="Departamentos"
        actions={
          can('departments', 'create') ? (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing('new')}>
              Nuevo departamento
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

      {failure ? (
        <Alert severity="error" onClose={() => setFailure(null)} sx={{ mb: 2 }}>
          {failure.message}
          {failure.departmentId ? (
            <>
              {' '}
              <Link component={RouterLink} to={usersOfDepartmentPath(failure.departmentId)}>
                Ver sus usuarios
              </Link>
            </>
          ) : null}
        </Alert>
      ) : null}

      <DataList
        label="Lista de departamentos"
        noun="departamentos"
        columns={COLUMNS}
        rows={departments.data?.data}
        error={departments.isError ? problemMessage(departments.error) : null}
        getRowId={(department) => department.id}
        getRowName={(department) => department.name}
        getActions={actionsFor}
        pagination={{
          page: filters.page,
          perPage: PER_PAGE,
          total: departments.data?.meta.total ?? 0,
          onPageChange: filters.setPage,
        }}
      />

      {editing !== null ? (
        <DepartmentDialog
          department={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <ConfirmDialog
        open={pending?.open === true}
        title={pending?.activate ? 'Reactivar departamento' : 'Desactivar departamento'}
        message={
          pending?.activate
            ? `«${pending.department.name}» volverá a estar disponible para asignar usuarios.`
            : `«${pending?.department.name ?? ''}» dejará de estar disponible para asignar usuarios. Sus datos se conservan.`
        }
        confirmLabel={pending?.activate ? 'Reactivar' : 'Desactivar'}
        busy={setActive.isPending}
        onConfirm={() => void confirm()}
        onCancel={() => setPending(pending && { ...pending, open: false })}
      />
    </>
  );
}

const COLUMNS: DataColumn<Department>[] = [
  {
    id: 'name',
    header: 'Nombre',
    mobile: 'title',
    minWidth: 200,
    render: (department) => department.name,
  },
  {
    id: 'users',
    header: 'Usuarios',
    mobile: 'subtitle',
    render: (department) => (
      <Link
        component={RouterLink}
        to={usersOfDepartmentPath(department.id)}
        // A link in a card is a touch target like any button.
        sx={{ display: 'inline-flex', alignItems: 'center', [touchQuery]: { minHeight: 44 } }}
      >
        {activeUsersLabel(department.active_user_count)}
      </Link>
    ),
  },
  {
    id: 'status',
    header: 'Estado',
    mobile: 'badge',
    nowrap: true,
    render: (department) => <ActiveBadge active={department.is_active} />,
  },
];

/** Creates a department (`department` null) or renames one. */
function DepartmentDialog({
  department,
  onClose,
}: {
  department: Department | null;
  onClose: () => void;
}) {
  const save = useSaveDepartment();
  const [name, setName] = useState(department?.name ?? '');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFieldError(null);
    setFailure(null);
    try {
      await save.mutateAsync({
        name: name.trim(),
        id: department?.id,
        version: department?.version,
      });
      onClose();
    } catch (error) {
      const fields = fieldMessages(error, {
        name: { taken: 'Ya hay un departamento activo con ese nombre.' },
      });
      setFieldError(fields.name ?? null);
      setFailure(
        fields.name
          ? null
          : problemMessage(error, {
              conflict:
                'Otra persona cambió este departamento mientras lo editabas. Cierra y vuelve a intentarlo.',
            }),
      );
    }
  };

  return (
    <Dialog
      open
      onClose={save.isPending ? undefined : onClose}
      fullWidth
      maxWidth="xs"
      aria-labelledby="department-dialog-title"
    >
      <form onSubmit={(event) => void submit(event)} noValidate>
        <DialogTitle id="department-dialog-title">
          {department ? 'Renombrar departamento' : 'Nuevo departamento'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {failure ? <Alert severity="error">{failure}</Alert> : null}
            <TextField
              label="Nombre"
              value={name}
              onChange={(event) => setName(event.target.value)}
              error={fieldError !== null}
              helperText={fieldError}
              slotProps={{ htmlInput: { maxLength: 100 } }}
              required
              fullWidth
              autoFocus
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" color="inherit" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" variant="contained" disabled={save.isPending || !name.trim()}>
            Guardar
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
