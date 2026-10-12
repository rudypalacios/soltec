import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import type { components } from '@soltec/shared';
import { useMemo, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { DataList, type DataColumn } from '../../components/DataList';
import { PageHeader } from '../../components/PageHeader';
import type { RowAction } from '../../components/RowActions';
import { formatMoment } from '../access/formatting';
import { problemMessage } from '../access/messages';
import { useCan } from '../access/SessionContext';
import {
  ACTION_LABELS,
  ENTITY_LABELS,
  ENTITY_NOUNS,
  actionLabel,
  entityLabel,
  historyPath,
  recordPath,
} from './auditLabels';
import { useAuditLog, type AuditQuery } from './useAuditLog';

type AuditEntry = components['schemas']['AuditEntry'];

const WHO_WITHOUT_SESSION = 'Sistema o sin sesión';

const COLUMNS: DataColumn<AuditEntry>[] = [
  {
    id: 'when',
    header: 'Fecha',
    mobile: 'subtitle',
    nowrap: true,
    render: (entry) => formatMoment(entry.occurred_at),
  },
  {
    id: 'action',
    header: 'Qué pasó',
    mobile: 'title',
    minWidth: 160,
    render: (entry) => actionLabel(entry.action),
  },
  {
    id: 'who',
    header: 'Quién',
    mobile: 'meta',
    render: (entry) => entry.user?.name ?? WHO_WITHOUT_SESSION,
  },
  {
    id: 'entity',
    header: 'Sobre',
    mobile: 'meta',
    render: (entry) => entityLabel(entry.entity_type),
  },
  {
    id: 'record',
    header: 'Registro',
    mobile: 'meta',
    render: (entry) => <RecordCell entry={entry} />,
  },
];

/**
 * The name of the record the entry is about, as a link to it when there is a screen and the person may open it. An
 * entry from before names were stored shows the name the record has now, and says so.
 */
function RecordCell({ entry }: { entry: AuditEntry }) {
  const can = useCan();
  if (entry.entity_label === null) {
    return <>—</>;
  }
  const path = recordPath(entry.entity_type, entry.entity_id, can);
  return (
    <>
      {path ? (
        <Link component={RouterLink} to={path} underline="hover" sx={{ fontWeight: 500 }}>
          {entry.entity_label}
        </Link>
      ) : (
        entry.entity_label
      )}
      {entry.entity_label_is_current ? (
        <Chip
          size="small"
          variant="outlined"
          label="nombre actual"
          title="Este movimiento es anterior a que se guardara el nombre: se muestra el que tiene hoy."
          sx={{ ml: 1, height: 20, fontSize: 11 }}
        />
      ) : null}
    </>
  );
}

/** `date` input value (`2026-10-11`) to the start or end of that day in the person's time zone, as an instant. */
function dayBoundary(day: string, end: boolean): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return undefined;
  }
  const moment = new Date(`${day}T${end ? '23:59:59.999' : '00:00:00.000'}`);
  return Number.isNaN(moment.getTime()) ? undefined : moment.toISOString();
}

/** `/auditoria`: who did what and when, newest first. Read-only: nothing here can change the log. */
export function AuditPage() {
  const [params, setParams] = useSearchParams();
  const type = params.get('tipo') ?? '';
  const action = params.get('accion') ?? '';
  const from = params.get('desde') ?? '';
  const to = params.get('hasta') ?? '';
  const record = params.get('registro') ?? '';
  const [detail, setDetail] = useState<AuditEntry | null>(null);

  const rangeInvalid = from !== '' && to !== '' && from > to;
  const query = useMemo<AuditQuery>(
    () => ({
      ...(type ? { entity_type: type } : {}),
      ...(action ? { action } : {}),
      ...(record ? { entity_id: record } : {}),
      ...(dayBoundary(from, false) ? { from: dayBoundary(from, false) } : {}),
      ...(dayBoundary(to, true) ? { to: dayBoundary(to, true) } : {}),
    }),
    [type, action, record, from, to],
  );
  const log = useAuditLog(query, !rangeInvalid);
  const rows = log.data?.pages.flatMap((page) => page.data);

  const setFilter = (name: string, value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) {
          next.set(name, value);
        } else {
          next.delete(name);
        }
        return next;
      },
      { replace: true },
    );

  const actionsFor = (entry: AuditEntry): RowAction[] => [
    {
      key: 'detail',
      label: 'Ver detalle',
      icon: <VisibilityOutlined />,
      onSelect: () => setDetail(entry),
    },
  ];

  return (
    <>
      <PageHeader title="Auditoría" />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
        <TextField
          select
          label="Sobre"
          value={type}
          onChange={(event) => setFilter('tipo', event.target.value)}
          sx={{ flex: { xs: '1 1 140px', sm: '0 0 auto' }, minWidth: { sm: 190 } }}
        >
          <MenuItem value="">Todo</MenuItem>
          {Object.entries(ENTITY_LABELS).map(([code, label]) => (
            <MenuItem key={code} value={code}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Qué pasó"
          value={action}
          onChange={(event) => setFilter('accion', event.target.value)}
          sx={{ flex: { xs: '1 1 140px', sm: '0 0 auto' }, minWidth: { sm: 220 } }}
        >
          <MenuItem value="">Todo</MenuItem>
          {Object.entries(ACTION_LABELS).map(([code, label]) => (
            <MenuItem key={code} value={code}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Desde"
          type="date"
          value={from}
          onChange={(event) => setFilter('desde', event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ flex: { xs: '1 1 140px', sm: '0 0 auto' } }}
        />
        <TextField
          label="Hasta"
          type="date"
          value={to}
          onChange={(event) => setFilter('hasta', event.target.value)}
          error={rangeInvalid}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ flex: { xs: '1 1 140px', sm: '0 0 auto' } }}
        />
      </Box>

      {record ? (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() =>
                setParams(
                  (current) => {
                    const next = new URLSearchParams(current);
                    next.delete('registro');
                    next.delete('tipo');
                    return next;
                  },
                  { replace: true },
                )
              }
            >
              Ver todo
            </Button>
          }
        >
          Solo se muestran los movimientos de un registro.
        </Alert>
      ) : null}
      {rangeInvalid ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          La fecha «Desde» no puede ser posterior a «Hasta».
        </Alert>
      ) : (
        <>
          <DataList
            label="Movimientos registrados"
            noun="movimientos"
            columns={COLUMNS}
            rows={rows}
            error={log.isError ? problemMessage(log.error) : null}
            getRowId={(entry) => entry.id}
            getRowName={(entry) =>
              `${actionLabel(entry.action)}, ${formatMoment(entry.occurred_at)}`
            }
            getActions={actionsFor}
          />
          {log.hasNextPage ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Button
                variant="outlined"
                onClick={() => void log.fetchNextPage()}
                disabled={log.isFetchingNextPage}
                sx={{ minHeight: 44 }}
              >
                {log.isFetchingNextPage ? (
                  <CircularProgress size={22} aria-label="Cargando más movimientos" />
                ) : (
                  'Ver movimientos anteriores'
                )}
              </Button>
            </Box>
          ) : null}
        </>
      )}

      <DetailDialog entry={detail} onClose={() => setDetail(null)} />
    </>
  );
}

/** Shows a value of a change as text: strings as they are, anything else as JSON. */
function show(value: unknown): string {
  if (value === undefined) {
    return '—';
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function DetailDialog({ entry, onClose }: { entry: AuditEntry | null; onClose: () => void }) {
  const before = (entry?.before ?? {}) as Record<string, unknown>;
  const after = (entry?.after ?? {}) as Record<string, unknown>;
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();

  return (
    <Dialog open={entry !== null} onClose={onClose} fullWidth maxWidth="sm" scroll="paper">
      <DialogTitle>{entry ? actionLabel(entry.action) : ''}</DialogTitle>
      <DialogContent dividers>
        {entry ? (
          <Stack spacing={2}>
            <Stack spacing={0.5}>
              <Typography variant="body2">
                <strong>Cuándo:</strong> {formatMoment(entry.occurred_at)}
              </Typography>
              <Typography variant="body2">
                <strong>Quién:</strong> {entry.user?.name ?? WHO_WITHOUT_SESSION}
                {entry.user?.name_is_current ? ' (nombre actual)' : ''}
              </Typography>
              <Typography variant="body2">
                <strong>Sobre:</strong> {entityLabel(entry.entity_type)}
              </Typography>
              {entry.entity_id ? <RecordLine entry={entry} onNavigate={onClose} /> : null}
              {entry.ip_address ? (
                <Typography variant="body2">
                  <strong>Dirección IP:</strong> {entry.ip_address}
                </Typography>
              ) : null}
            </Stack>
            {fields.length === 0 ? (
              <Typography color="text.secondary">Este movimiento no cambió datos.</Typography>
            ) : (
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small" aria-label="Cambios">
                  <TableHead>
                    <TableRow>
                      <TableCell>Campo</TableCell>
                      <TableCell>Antes</TableCell>
                      <TableCell>Después</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {fields.map((field) => (
                      <TableRow key={field}>
                        <TableCell sx={{ verticalAlign: 'top' }}>{field}</TableCell>
                        <TableCell sx={{ wordBreak: 'break-word', verticalAlign: 'top' }}>
                          {show(before[field])}
                        </TableCell>
                        <TableCell sx={{ wordBreak: 'break-word', verticalAlign: 'top' }}>
                          {show(after[field])}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
          </Stack>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ minHeight: 44 }}>
          Cerrar
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** «Registro: Perfil «Comercial»» with a way to its screen and to its history. */
function RecordLine({ entry, onNavigate }: { entry: AuditEntry; onNavigate: () => void }) {
  const can = useCan();
  if (entry.entity_id === null) {
    return null;
  }
  const noun = ENTITY_NOUNS[entry.entity_type];
  const path = recordPath(entry.entity_type, entry.entity_id, can);
  const name = entry.entity_label === null ? null : `«${entry.entity_label}»`;
  return (
    <Typography variant="body2">
      <strong>Registro:</strong>{' '}
      {[noun, name].filter(Boolean).join(' ') || entityLabel(entry.entity_type)}
      {entry.entity_label_is_current ? ' (nombre actual)' : ''}
      {path ? (
        <>
          {' · '}
          <Link component={RouterLink} to={path} onClick={onNavigate}>
            Ver el {noun ? noun.toLowerCase() : 'registro'}
          </Link>
        </>
      ) : null}
      {' · '}
      <Link
        component={RouterLink}
        to={historyPath(entry.entity_type, entry.entity_id)}
        onClick={onNavigate}
      >
        Ver su historial
      </Link>
    </Typography>
  );
}
