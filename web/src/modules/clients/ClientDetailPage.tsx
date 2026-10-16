import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import type { components } from '@soltec/shared';
import { useState, type ReactNode } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { ACTION_ICONS } from '../../components/actionIcons';
import { CodeChip } from '../../components/CodeChip';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { IDENTIFICATION_LABELS } from '../../components/identification';
import { InactiveTag } from '../../components/inactiveMarks';
import { ActionMenu, type RowAction } from '../../components/RowActions';
import { problemMessage } from '../access/messages';
import { useCan } from '../access/SessionContext';
import { ClientStatusBadge, TypeTag } from './clientParts';
import { ContactsSection } from './ContactsSection';
import { ConvertDialog } from './ConvertDialog';
import { SellersSection } from './SellersSection';
import { useClient, useSetClientActive } from './useClients';

type Client = components['schemas']['Client'];

/** `/clientes/:clientId`: the client as whoever may view it sees it, with the actions their permissions allow. */
export function ClientDetailPage() {
  const { clientId } = useParams();
  const client = useClient(clientId);

  if (client.isError) {
    return <Alert severity="error">{problemMessage(client.error)}</Alert>;
  }
  if (client.isPending) {
    return <CircularProgress aria-label="Cargando el cliente" />;
  }
  return <LoadedClient client={client.data} />;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" component="div">
        {label}
      </Typography>
      <Typography component="div" sx={{ overflowWrap: 'anywhere' }}>
        {children}
      </Typography>
    </Box>
  );
}

function Facts({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 1.5,
        gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
      }}
    >
      {children}
    </Box>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Typography variant="h6" component="h2">
          {title}
        </Typography>
        {children}
      </Stack>
    </Paper>
  );
}

function LoadedClient({ client }: { client: Client }) {
  const can = useCan();
  const setActive = useSetClientActive();
  const [converting, setConverting] = useState(false);
  const [toggling, setToggling] = useState<{ open: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const toggle = async () => {
    setFailure(null);
    try {
      await setActive.mutateAsync({ clientId: client.id, active: !client.is_active });
    } catch (error) {
      setFailure(problemMessage(error));
    } finally {
      setToggling({ open: false });
    }
  };

  // The one action the screen leads to stays in view; the rest, and the history, are behind the ⋮ button.
  const mayEdit = can('clients', 'edit');
  const converts = mayEdit && client.type === 'prospect' && client.is_active;
  const primary = converts ? (
    <Button variant="contained" onClick={() => setConverting(true)}>
      Convertir en cliente
    </Button>
  ) : mayEdit ? (
    <Button component={RouterLink} to={`/clientes/${client.id}/editar`} variant="outlined">
      Editar
    </Button>
  ) : null;
  const menu: RowAction[] = [];
  if (converts) {
    menu.push({
      key: 'edit',
      label: 'Editar',
      icon: ACTION_ICONS.edit,
      to: `/clientes/${client.id}/editar`,
    });
  }
  if (can('clients', 'deactivate')) {
    menu.push({
      key: 'toggle',
      label: client.is_active ? 'Desactivar' : 'Reactivar',
      icon: client.is_active ? ACTION_ICONS.deactivate : ACTION_ICONS.reactivate,
      tone: client.is_active ? 'danger' : undefined,
      onSelect: () => setToggling({ open: true }),
    });
  }
  if (can('audit_logs', 'view')) {
    menu.push({
      key: 'history',
      label: 'Ver historial',
      icon: ACTION_ICONS.history,
      to: `/auditoria?tipo=clients&registro=${client.id}`,
    });
  }

  const billing = client.billing_profile;
  const primaryFirst = [...client.addresses].sort(
    (a, b) => Number(b.is_primary === true) - Number(a.is_primary === true),
  );

  return (
    <>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ mb: 3, alignItems: { sm: 'flex-start' }, justifyContent: 'space-between' }}
      >
        <Box sx={{ display: 'flex', gap: 1, minWidth: 0, alignItems: 'flex-start' }}>
          <IconButton
            component={RouterLink}
            to="/clientes"
            aria-label="Volver a clientes"
            edge="start"
            sx={{ mt: -0.5 }}
          >
            <ArrowBackIcon />
          </IconButton>
          <Stack spacing={1} sx={{ minWidth: 0 }}>
            <Typography variant="h5" component="h1" sx={{ overflowWrap: 'anywhere' }}>
              {client.name}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <CodeChip code={client.code} />
              <TypeTag type={client.type} />
              {client.is_active ? null : <InactiveTag />}
              <ClientStatusBadge status={client.status} />
            </Stack>
          </Stack>
        </Box>
        {primary || menu.length > 0 ? (
          <Box sx={{ display: 'flex', gap: 1, flexShrink: 0, alignItems: 'center' }}>
            {primary}
            {menu.length > 0 ? <ActionMenu actions={menu} rowName={client.name} /> : null}
          </Box>
        ) : null}
      </Stack>

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

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          alignItems: 'start',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 3fr) minmax(0, 2fr)' },
        }}
      >
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <Section title="Datos generales">
            <Facts>
              <Fact label="Identificación">
                {client.identification
                  ? `${IDENTIFICATION_LABELS[client.identification_type]} ${client.identification}`
                  : IDENTIFICATION_LABELS.none}
              </Fact>
              <Fact label="Segmento">{client.segment?.name ?? '—'}</Fact>
              <Fact label="Área de interés">{client.area?.name ?? '—'}</Fact>
              <Fact label="Nivel de margen habitual">
                {client.margin_level?.name ?? 'El nivel por defecto'}
              </Fact>
            </Facts>
          </Section>
          {billing ? (
            <Section title="Perfil de facturación">
              <Facts>
                <Fact label="Nombre fiscal">{billing.legal_name}</Fact>
                <Fact label="Régimen fiscal">{billing.tax_regime?.name ?? '—'}</Fact>
                <Fact label="Forma de pago">{billing.payment_method?.name ?? '—'}</Fact>
                <Fact label="Crédito">
                  {billing.credit_days === null && billing.credit_limit === null
                    ? '—'
                    : [
                        billing.credit_days === null ? null : `${billing.credit_days} días`,
                        billing.credit_limit === null
                          ? null
                          : `límite ${Number(billing.credit_limit).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                </Fact>
              </Facts>
            </Section>
          ) : null}
          <Section title="Direcciones">
            {primaryFirst.length === 0 ? (
              <Typography color="text.secondary">Sin direcciones.</Typography>
            ) : (
              primaryFirst.map((address, index) => (
                <Box key={index}>
                  <Typography sx={{ fontWeight: 500 }}>
                    {address.label}
                    {address.is_primary ? ' · Principal' : ''}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {[address.address, address.zone, address.country].filter(Boolean).join(', ')}
                  </Typography>
                </Box>
              ))
            )}
          </Section>
        </Stack>
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <SellersSection client={client} onNotice={setNotice} onFailure={setFailure} />
          <ContactsSection client={client} onNotice={setNotice} onFailure={setFailure} />
        </Stack>
      </Box>

      <ConvertDialog
        client={client}
        open={converting}
        onClose={() => setConverting(false)}
        onDone={setNotice}
      />
      <ConfirmDialog
        open={toggling?.open === true}
        title={client.is_active ? 'Desactivar cliente' : 'Reactivar cliente'}
        message={
          client.is_active
            ? `«${client.name}» dejará de aparecer en las listas activas. Sus datos, sus asesores y su identificación se conservan: para volver a registrarlo se reactiva este mismo cliente.`
            : `«${client.name}» volverá a aparecer en las listas activas.`
        }
        confirmLabel={client.is_active ? 'Desactivar' : 'Reactivar'}
        destructive={client.is_active}
        busy={setActive.isPending}
        onConfirm={() => void toggle()}
        onCancel={() => setToggling({ open: false })}
      />
    </>
  );
}
