import { Alert, Typography } from '@mui/material';
import type { components } from '@soltec/shared';
import { useState } from 'react';
import { ACTION_ICONS } from '../../components/actionIcons';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataList, type DataColumn } from '../../components/DataList';
import { PageHeader } from '../../components/PageHeader';
import type { RowAction } from '../../components/RowActions';
import { StatusBadge } from '../../components/StatusBadge';
import { formatMoment } from './formatting';
import { problemMessage } from './messages';
import { useMyDevices, useRevokeDevice } from './useDevices';

type Device = components['schemas']['Device'];

const PLATFORMS: Record<Device['platform'], string> = {
  web: 'Navegador',
  android: 'Android',
  ios: 'iPhone o iPad',
};

const COLUMNS: DataColumn<Device>[] = [
  {
    id: 'name',
    header: 'Dispositivo',
    mobile: 'title',
    minWidth: 180,
    render: (device) => device.name ?? PLATFORMS[device.platform],
  },
  {
    id: 'platform',
    header: 'Tipo',
    mobile: 'subtitle',
    render: (device) => PLATFORMS[device.platform],
  },
  {
    id: 'current',
    header: 'Sesión',
    mobile: 'badge',
    nowrap: true,
    render: (device) =>
      device.current ? <StatusBadge tone="success" label="Esta sesión" /> : 'Abierta',
  },
  {
    id: 'last_seen',
    header: 'Última actividad',
    mobile: 'meta',
    nowrap: true,
    render: (device) => formatMoment(device.last_seen_at),
  },
  {
    id: 'created',
    header: 'Se abrió',
    mobile: 'meta',
    nowrap: true,
    render: (device) => formatMoment(device.created_at),
  },
];

/** `/cuenta/sesiones`: where the signed-in person has a session open, and a way to close the ones they do not know. */
export function SessionsPage() {
  const devices = useMyDevices();
  const revoke = useRevokeDevice();
  const [pending, setPending] = useState<Device | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const actionsFor = (device: Device): RowAction[] =>
    // Closing the session in use is «Cerrar sesión» of the menu; here it would only strand the person.
    device.current
      ? []
      : [
          {
            key: 'close',
            label: 'Cerrar sesión',
            icon: ACTION_ICONS.deactivate,
            tone: 'danger',
            onSelect: () => setPending(device),
          },
        ];

  const confirm = async () => {
    if (!pending) {
      return;
    }
    setActionError(null);
    try {
      await revoke.mutateAsync(pending.id);
    } catch (error) {
      // Already closed from elsewhere: the list refreshes and no longer shows it.
      setActionError(problemMessage(error));
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <PageHeader title="Mis sesiones" />
      <Typography color="text.secondary" sx={{ mb: 2, maxWidth: 640 }}>
        Los dispositivos donde tu cuenta tiene una sesión abierta. Si no reconoces alguno, ciérralo
        y cambia tu contraseña.
      </Typography>
      {actionError ? (
        <Alert severity="error" onClose={() => setActionError(null)} sx={{ mb: 2 }}>
          {actionError}
        </Alert>
      ) : null}
      <DataList
        label="Lista de sesiones abiertas"
        noun="sesiones"
        columns={COLUMNS}
        rows={devices.data?.data}
        error={devices.isError ? problemMessage(devices.error) : null}
        getRowId={(device) => device.id}
        getRowName={(device) => device.name ?? PLATFORMS[device.platform]}
        getActions={actionsFor}
      />
      <ConfirmDialog
        open={pending !== null}
        title="Cerrar sesión"
        message={`Se cerrará la sesión de ${pending?.name ?? 'ese dispositivo'}. Para volver a usarlo tendrá que iniciar sesión de nuevo.`}
        confirmLabel="Cerrar sesión"
        destructive
        busy={revoke.isPending}
        onConfirm={() => void confirm()}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
