import AddIcon from '@mui/icons-material/Add';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Paper,
  Snackbar,
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
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PageHeader } from '../../components/PageHeader';
import { useIsMobile } from '../../components/useIsMobile';
import { problemMessage } from './messages';
import { useCan } from './SessionContext';
import { StatusFilter, type StatusValue } from './StatusFilter';
import { useRoles, useSetRoleActive } from './useRoles';

type Role = components['schemas']['Role'];
const PER_PAGE = 25;

const ACTIVE_CONFLICTS = {
  conflict:
    'No se puede desactivar: hay usuarios activos con este perfil. Cámbiales el perfil primero.',
};

export function RolesPage() {
  const isMobile = useIsMobile();
  const can = useCan();
  const location = useLocation();
  const [text, setText] = useState('');
  const deferredText = useDeferredValue(text);
  const [status, setStatus] = useState<StatusValue>('active');
  const [page, setPage] = useState(0);
  const [pending, setPending] = useState<{ role: Role; activate: boolean } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(() => {
    const message = (location.state as { flash?: unknown } | null)?.flash;
    return typeof message === 'string' ? message : null;
  });

  const roles = useRoles({
    q: deferredText.trim() || undefined,
    status,
    page: page + 1,
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

      {actionError ? (
        <Alert severity="error" onClose={() => setActionError(null)} sx={{ mb: 2 }}>
          {actionError}
        </Alert>
      ) : null}

      {roles.isPending ? (
        <CircularProgress aria-label="Cargando perfiles" />
      ) : roles.isError ? (
        <Alert severity="error">{problemMessage(roles.error)}</Alert>
      ) : roles.data.data.length === 0 ? (
        <Alert severity="info">No hay perfiles con esos filtros.</Alert>
      ) : isMobile ? (
        <Stack spacing={1.5} aria-label="Lista de perfiles">
          {roles.data.data.map((role) => (
            <RoleCard
              key={role.id}
              role={role}
              canEdit={canEdit}
              canDeactivate={canDeactivate}
              onToggle={() => setPending({ role, activate: !role.is_active })}
            />
          ))}
        </Stack>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" aria-label="Lista de perfiles">
            <TableHead>
              <TableRow>
                <TableCell>Nombre</TableCell>
                <TableCell>Descripción</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {roles.data.data.map((role) => (
                <TableRow key={role.id} hover>
                  <TableCell>{role.name}</TableCell>
                  <TableCell>{role.description ?? ''}</TableCell>
                  <TableCell>
                    {role.is_system ? <Chip size="small" label="Sistema" /> : 'Personalizado'}
                  </TableCell>
                  <TableCell>
                    <ActiveChip role={role} />
                  </TableCell>
                  <TableCell align="right">
                    <RoleActions
                      role={role}
                      canEdit={canEdit}
                      canDeactivate={canDeactivate}
                      onToggle={() => setPending({ role, activate: !role.is_active })}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {roles.data ? (
        <TablePagination
          component="div"
          count={roles.data.meta.total}
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
        title={pending?.activate ? 'Reactivar perfil' : 'Desactivar perfil'}
        message={
          pending?.activate
            ? `El perfil «${pending.role.name}» podrá asignarse de nuevo.`
            : `El perfil «${pending?.role.name ?? ''}» dejará de poder asignarse. Sus datos se conservan.`
        }
        confirmLabel={pending?.activate ? 'Reactivar' : 'Desactivar'}
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

function ActiveChip({ role }: { role: Role }) {
  return role.is_active ? (
    <Chip size="small" color="success" variant="outlined" label="Activo" />
  ) : (
    <Chip size="small" label="Inactivo" />
  );
}

function RoleActions({
  role,
  canEdit,
  canDeactivate,
  onToggle,
}: {
  role: Role;
  canEdit: boolean;
  canDeactivate: boolean;
  onToggle: () => void;
}) {
  return (
    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
      <Button
        size="small"
        component={RouterLink}
        to={`/perfiles/${role.id}`}
        aria-label={`${canEdit && !role.is_system ? 'Editar' : 'Ver'} ${role.name}`}
      >
        {canEdit && !role.is_system ? 'Editar' : 'Ver'}
      </Button>
      {canDeactivate && !role.is_system ? (
        <Button
          size="small"
          color={role.is_active ? 'error' : 'primary'}
          onClick={onToggle}
          aria-label={`${role.is_active ? 'Desactivar' : 'Reactivar'} ${role.name}`}
        >
          {role.is_active ? 'Desactivar' : 'Reactivar'}
        </Button>
      ) : null}
    </Box>
  );
}

function RoleCard(props: {
  role: Role;
  canEdit: boolean;
  canDeactivate: boolean;
  onToggle: () => void;
}) {
  const { role } = props;
  return (
    <Card variant="outlined">
      <CardContent sx={{ '&:last-child': { pb: 1.5 } }}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
        >
          <Typography sx={{ fontWeight: 600 }}>{role.name}</Typography>
          <Stack direction="row" spacing={0.5}>
            {role.is_system ? <Chip size="small" label="Sistema" /> : null}
            <ActiveChip role={role} />
          </Stack>
        </Stack>
        {role.description ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {role.description}
          </Typography>
        ) : null}
        <Box sx={{ mt: 1, ml: -1 }}>
          <RoleActions {...props} />
        </Box>
      </CardContent>
    </Card>
  );
}
