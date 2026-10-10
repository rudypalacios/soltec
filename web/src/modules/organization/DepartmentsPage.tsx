import AddIcon from '@mui/icons-material/Add';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
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
import { ApiError, type components } from '@soltec/shared';
import { useDeferredValue, useState, type FormEvent } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PageHeader } from '../../components/PageHeader';
import { useIsMobile } from '../../components/useIsMobile';
import { fieldMessages, problemMessage } from '../access/messages';
import { useCan } from '../access/SessionContext';
import { StatusFilter, type StatusValue } from '../../components/StatusFilter';
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
  const isMobile = useIsMobile();
  const can = useCan();
  const [text, setText] = useState('');
  const deferredText = useDeferredValue(text);
  const [status, setStatus] = useState<StatusValue>('active');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Department | 'new' | null>(null);
  // Kept after closing (`open` false) so the dialog does not lose its text while it fades out.
  const [pending, setPending] = useState<{
    department: Department;
    activate: boolean;
    open: boolean;
  } | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

  const departments = useDepartments({
    q: deferredText.trim() || undefined,
    status,
    page: page + 1,
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

  const rowActions = {
    canEdit: can('departments', 'edit'),
    canToggle: can('departments', 'deactivate'),
    onEdit: (department: Department) => setEditing(department),
    onToggle: (department: Department) =>
      setPending({ department, activate: !department.is_active, open: true }),
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

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          label="Buscar por nombre"
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

      {departments.isPending ? (
        <CircularProgress aria-label="Cargando departamentos" />
      ) : departments.isError ? (
        <Alert severity="error">{problemMessage(departments.error)}</Alert>
      ) : departments.data.data.length === 0 ? (
        <Alert severity="info">No hay departamentos con esos filtros.</Alert>
      ) : isMobile ? (
        <Stack spacing={1.5} aria-label="Lista de departamentos">
          {departments.data.data.map((department) => (
            <DepartmentCard key={department.id} department={department} {...rowActions} />
          ))}
        </Stack>
      ) : (
        <DepartmentsTable departments={departments.data.data} {...rowActions} />
      )}

      {departments.data ? (
        <TablePagination
          component="div"
          count={departments.data.meta.total}
          page={page}
          onPageChange={(_, next) => setPage(next)}
          rowsPerPage={PER_PAGE}
          rowsPerPageOptions={[]}
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
          sx={{ '.MuiTablePagination-toolbar': { px: 0 } }}
        />
      ) : null}

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

interface RowActionProps {
  canEdit: boolean;
  canToggle: boolean;
  onEdit: (department: Department) => void;
  onToggle: (department: Department) => void;
}

function StatusChip({ department }: { department: Department }) {
  return department.is_active ? (
    <Chip size="small" color="success" variant="outlined" label="Activo" />
  ) : (
    <Chip size="small" label="Inactivo" />
  );
}

function UsersLink({ department }: { department: Department }) {
  return (
    <Link component={RouterLink} to={usersOfDepartmentPath(department.id)}>
      {activeUsersLabel(department.active_user_count)}
    </Link>
  );
}

function RowButtons({
  department,
  canEdit,
  canToggle,
  onEdit,
  onToggle,
}: RowActionProps & { department: Department }) {
  return (
    <>
      {canEdit ? (
        <Button
          size="small"
          onClick={() => onEdit(department)}
          aria-label={`Renombrar: ${department.name}`}
          sx={{ minHeight: 44 }}
        >
          Renombrar
        </Button>
      ) : null}
      {canToggle ? (
        <Button
          size="small"
          color={department.is_active ? 'error' : 'primary'}
          onClick={() => onToggle(department)}
          aria-label={`${department.is_active ? 'Desactivar' : 'Reactivar'}: ${department.name}`}
          sx={{ minHeight: 44 }}
        >
          {department.is_active ? 'Desactivar' : 'Reactivar'}
        </Button>
      ) : null}
    </>
  );
}

function DepartmentsTable({
  departments,
  ...actions
}: RowActionProps & { departments: Department[] }) {
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" aria-label="Lista de departamentos">
        <TableHead>
          <TableRow>
            <TableCell>Nombre</TableCell>
            <TableCell>Usuarios</TableCell>
            <TableCell>Estado</TableCell>
            <TableCell align="right">
              <span style={{ position: 'absolute', left: -9999 }}>Acciones</span>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {departments.map((department) => (
            <TableRow key={department.id} hover>
              <TableCell>{department.name}</TableCell>
              <TableCell>
                <UsersLink department={department} />
              </TableCell>
              <TableCell>
                <StatusChip department={department} />
              </TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                <RowButtons department={department} {...actions} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function DepartmentCard({ department, ...actions }: RowActionProps & { department: Department }) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ '&:last-child': { pb: 2 } }}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 600 }}>{department.name}</Typography>
            <Typography variant="body2">
              <UsersLink department={department} />
            </Typography>
          </Box>
          <StatusChip department={department} />
        </Stack>
        <Stack direction="row" sx={{ mt: 1, ml: -1, flexWrap: 'wrap' }}>
          <RowButtons department={department} {...actions} />
        </Stack>
      </CardContent>
    </Card>
  );
}

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
          <Button onClick={onClose} disabled={save.isPending}>
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
