import AddIcon from '@mui/icons-material/Add';
import { Alert, Box, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import type { components } from '@soltec/shared';
import { useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ACTION_ICONS } from '../../components/actionIcons';
import { CodeChip } from '../../components/CodeChip';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataList, type DataColumn } from '../../components/DataList';
import { FilterBar } from '../../components/FilterBar';
import { Highlight } from '../../components/Highlight';
import { identificationText } from '../../components/identification';
import { INACTIVE_CARD, InactiveTag } from '../../components/inactiveMarks';
import { MetaLine } from '../../components/MetaLine';
import { PageHeader } from '../../components/PageHeader';
import type { RowAction } from '../../components/RowActions';
import { SearchableSelect } from '../../components/SearchableSelect';
import { ActiveBadge } from '../../components/StatusBadge';
import { StatusFilter } from '../../components/StatusFilter';
import { useIsMobile } from '../../components/useIsMobile';
import { useListFilters } from '../../components/useListFilters';
import { problemMessage } from '../access/messages';
import { useCan, useCurrentUser } from '../access/SessionContext';
import { ClientStatusBadge, MoreSellers, TypeTag } from './clientParts';
import { PortfolioDialog } from './PortfolioDialog';
import {
  useClients,
  useClientStatusOptions,
  usePersonOptions,
  useSegmentOptions,
  useSetClientActive,
} from './useClients';

type Client = components['schemas']['ClientSummary'];
type ClientType = components['schemas']['ClientType'];
const PER_PAGE = 25;
const ALL = '';

/** The width of a filter that is not a plain select, as `FilterBar` gives them. */
const FILTER_FIELD = { flex: { xs: '1 1 140px', sm: '0 0 200px' } } as const;

/** `/clientes`: prospects and customers inside the data scope of the person, in one list. */
export function ClientsPage() {
  const can = useCan();
  const me = useCurrentUser();
  const isMobile = useIsMobile();
  const filters = useListFilters();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [type, setType] = useState<ClientType | typeof ALL>(ALL);
  const [statusId, setStatusId] = useState(ALL);
  const [segmentId, setSegmentId] = useState(ALL);
  const [sellerId, setSellerId] = useState(ALL);
  const [pending, setPending] = useState<{
    client: Client;
    activate: boolean;
    open: boolean;
  } | null>(null);
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const clients = useClients({
    q: filters.query,
    status: filters.status,
    page: filters.page + 1,
    per_page: PER_PAGE,
    ...(type !== ALL ? { type } : {}),
    ...(statusId !== ALL ? { status_id: statusId } : {}),
    ...(segmentId !== ALL ? { segment_id: segmentId } : {}),
    ...(sellerId !== ALL ? { seller_id: sellerId } : {}),
  });
  const statuses = useClientStatusOptions();
  const segments = useSegmentOptions();
  const people = usePersonOptions('');
  const setActive = useSetClientActive();

  const narrow =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      filters.resetPage();
    };

  // Handing over a portfolio needs a scope that reaches other people's clients; the server enforces it too.
  const mayHandOver =
    can('clients', 'edit') && (me?.scopes.clients === 'team' || me?.scopes.clients === 'all');

  const confirm = async () => {
    if (!pending) {
      return;
    }
    setFailure(null);
    try {
      await setActive.mutateAsync({ clientId: pending.client.id, active: pending.activate });
    } catch (error) {
      setFailure(problemMessage(error));
    } finally {
      setPending({ ...pending, open: false });
    }
  };

  const actionsFor = (client: Client): RowAction[] => {
    const actions: RowAction[] = [
      {
        key: 'view',
        label: 'Ver',
        icon: ACTION_ICONS.view,
        to: `/clientes/${client.id}`,
      },
    ];
    if (can('clients', 'edit')) {
      actions.push({
        key: 'edit',
        label: 'Editar',
        icon: ACTION_ICONS.edit,
        to: `/clientes/${client.id}/editar`,
      });
    }
    if (can('clients', 'deactivate')) {
      actions.push({
        key: 'toggle',
        label: client.is_active ? 'Desactivar' : 'Reactivar',
        icon: client.is_active ? ACTION_ICONS.deactivate : ACTION_ICONS.reactivate,
        tone: client.is_active ? 'danger' : undefined,
        onSelect: () => setPending({ client, activate: !client.is_active, open: true }),
      });
    }
    return actions;
  };

  const total = clients.data?.meta.total;

  return (
    <>
      <PageHeader title="Clientes" />

      <FilterBar
        searchLabel="Buscar por nombre, código o identificación"
        search={filters.text}
        onSearchChange={filters.setText}
        collapsed={isMobile && !filtersOpen}
        beside={
          isMobile ? (
            <Button
              variant={filtersOpen ? 'contained' : 'outlined'}
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen(!filtersOpen)}
              sx={{ minHeight: 48 }}
            >
              Filtros
            </Button>
          ) : null
        }
        action={
          can('clients', 'create') || mayHandOver ? (
            <Stack direction="row" spacing={1}>
              {mayHandOver ? (
                <Button variant="outlined" onClick={() => setPortfolioOpen(true)}>
                  Reasignar cartera
                </Button>
              ) : null}
              {can('clients', 'create') ? (
                <Button
                  component={RouterLink}
                  to="/clientes/nuevo"
                  variant="contained"
                  startIcon={<AddIcon />}
                >
                  Nuevo prospecto
                </Button>
              ) : null}
            </Stack>
          ) : null
        }
      >
        <TextField
          select
          label="Tipo"
          slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          value={type}
          onChange={(event) => narrow(setType)(event.target.value as ClientType | typeof ALL)}
        >
          <MenuItem value={ALL}>Todos</MenuItem>
          <MenuItem value="prospect">Prospectos</MenuItem>
          <MenuItem value="customer">Clientes</MenuItem>
        </TextField>
        <TextField
          select
          label="Estado del cliente"
          slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          value={statusId}
          onChange={(event) => narrow(setStatusId)(event.target.value)}
        >
          <MenuItem value={ALL}>Todos</MenuItem>
          {(statuses.data?.data ?? []).map((status) => (
            <MenuItem key={status.id} value={status.id}>
              {status.name}
            </MenuItem>
          ))}
        </TextField>
        <Box sx={FILTER_FIELD}>
          <SearchableSelect
            label="Segmento"
            choices={(segments.data?.data ?? []).map((segment) => ({
              id: segment.id,
              label: segment.name,
            }))}
            value={segmentId}
            onChange={narrow(setSegmentId)}
          />
        </Box>
        <Box sx={FILTER_FIELD}>
          <SearchableSelect
            label="Asesor"
            choices={(people.data?.data ?? []).map((person) => ({
              id: person.id,
              label: person.name,
            }))}
            value={sellerId}
            onChange={narrow(setSellerId)}
          />
        </Box>
        <StatusFilter value={filters.status} onChange={filters.setStatus} />
      </FilterBar>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {total === undefined ? ' ' : total === 1 ? '1 resultado' : `${total} resultados`}
      </Typography>

      {failure ? (
        <Alert severity="error" onClose={() => setFailure(null)} sx={{ mb: 2 }}>
          {failure}
        </Alert>
      ) : null}
      {notice ? (
        <Alert severity="success" onClose={() => setNotice(null)} sx={{ mb: 2 }}>
          {notice}
        </Alert>
      ) : null}

      <DataList
        label="Lista de clientes"
        noun="clientes"
        columns={columnsFor(filters.query)}
        rows={clients.data?.data}
        error={clients.isError ? problemMessage(clients.error) : null}
        getRowId={(client) => client.id}
        getRowName={(client) => client.name}
        isInactive={(client) => !client.is_active}
        getActions={actionsFor}
        renderCard={(client, slots) => (
          <ClientCard client={client} match={filters.query} menu={slots.menu} />
        )}
        pagination={{
          page: filters.page,
          perPage: PER_PAGE,
          total: total ?? 0,
          onPageChange: filters.setPage,
        }}
      />

      <ConfirmDialog
        open={pending?.open === true}
        title={pending?.activate ? 'Reactivar cliente' : 'Desactivar cliente'}
        message={
          pending?.activate
            ? `«${pending.client.name}» volverá a aparecer en las listas activas.`
            : `«${pending?.client.name ?? ''}» dejará de aparecer en las listas activas. Sus datos, sus asesores y su identificación se conservan: para volver a registrarlo se reactiva este mismo cliente.`
        }
        confirmLabel={pending?.activate ? 'Reactivar' : 'Desactivar'}
        destructive={pending?.activate === false}
        busy={setActive.isPending}
        onConfirm={() => void confirm()}
        onCancel={() => setPending(pending && { ...pending, open: false })}
      />
      <PortfolioDialog
        open={portfolioOpen}
        onClose={() => setPortfolioOpen(false)}
        onDone={(message) => setNotice(message)}
      />
    </>
  );
}

/** The card of a phone: code, type and tag with the ⋮ menu; the whole name; status; identification and segment; adviser. */
function ClientCard({
  client,
  match,
  menu,
}: {
  client: Client;
  match: string | undefined;
  menu: ReactNode;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{ pl: 2, pr: 0.5, py: 1.5, ...(client.is_active ? {} : INACTIVE_CARD) }}
      data-testid="client-card"
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <CodeChip code={client.code} match={match} />
        <TypeTag type={client.type} />
        {client.is_active ? null : <InactiveTag />}
        <Box sx={{ flexGrow: 1 }} />
        {menu}
      </Stack>
      <Typography sx={{ fontWeight: 600, mt: 0.25, pr: 1.5, overflowWrap: 'anywhere' }}>
        <Highlight text={client.name} match={match} />
      </Typography>
      {client.status ? (
        <Box sx={{ mt: 0.5, pr: 1.5 }}>
          <ClientStatusBadge status={client.status} />
        </Box>
      ) : null}
      <Box sx={{ mt: 0.25, pr: 1.5 }}>
        <MetaLine
          parts={[client.identification ? identificationText(client) : null, client.segment?.name]}
        />
      </Box>
      <ResponsibleLine client={client} />
    </Paper>
  );
}

function ResponsibleLine({ client }: { client: Client }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5, pr: 1.5, minWidth: 0 }}>
      <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
        Asesor:
      </Typography>
      <Typography variant="body2" noWrap title={client.responsible?.name} sx={{ minWidth: 0 }}>
        {client.responsible?.name ?? '—'}
      </Typography>
      <MoreSellers count={client.seller_count} />
    </Stack>
  );
}

function columnsFor(match: string | undefined): DataColumn<Client>[] {
  return [
    {
      id: 'code',
      header: 'Código',
      mobile: 'subtitle',
      nowrap: true,
      render: (client) => <CodeChip code={client.code} match={match} />,
    },
    {
      id: 'name',
      header: 'Cliente',
      mobile: 'title',
      minWidth: 240,
      render: (client) => (
        <Box>
          <Typography
            component="div"
            sx={{ fontWeight: 600, color: 'text.primary', overflowWrap: 'anywhere' }}
          >
            <Highlight text={client.name} match={match} />
          </Typography>
          <Typography component="div" variant="body2" color="text.secondary">
            {[client.identification ? identificationText(client) : null, client.segment?.name]
              .filter(Boolean)
              .join(' · ')}
          </Typography>
        </Box>
      ),
    },
    {
      id: 'type',
      header: 'Tipo',
      mobile: 'hidden',
      nowrap: true,
      render: (client) => <TypeTag type={client.type} />,
    },
    {
      id: 'status',
      header: 'Estado del cliente',
      mobile: 'hidden',
      minWidth: 150,
      render: (client) => <ClientStatusBadge status={client.status} />,
    },
    {
      id: 'responsible',
      header: 'Asesor responsable',
      mobile: 'hidden',
      minWidth: 150,
      render: (client) => (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant="body2" sx={{ minWidth: 0 }}>
            {client.responsible?.name ?? '—'}
          </Typography>
          <MoreSellers count={client.seller_count} />
        </Stack>
      ),
    },
    {
      id: 'active',
      header: 'Actividad',
      mobile: 'hidden',
      nowrap: true,
      render: (client) => <ActiveBadge active={client.is_active} />,
    },
  ];
}
