import { Box, Card, CardActionArea, CardContent, Stack, Typography } from '@mui/material';
import type { components } from '@soltec/shared';
import type { ComponentType } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useCan } from '../access/SessionContext';
import { QuickCreateClientWidget } from '../clients/QuickCreateClientWidget';
import { HealthStatus } from '../system/HealthStatus';

type WidgetCode = components['schemas']['WidgetCode'];

const SHORTCUTS = [
  {
    label: 'Usuarios',
    hint: 'Cuentas y perfiles de las personas',
    path: '/usuarios',
    resource: 'users',
    action: 'view',
  },
  {
    label: 'Perfiles',
    hint: 'Qué puede hacer cada perfil',
    path: '/perfiles',
    resource: 'roles',
    action: 'view',
  },
];

/** Shortcuts to the screens the user may open. */
function QuickLinksWidget() {
  const can = useCan();
  const shortcuts = SHORTCUTS.filter((item) => can(item.resource, item.action));

  if (shortcuts.length === 0) {
    return (
      <Typography color="text.secondary">
        Tu cuenta aún no tiene pantallas asignadas. Pide a quien administra el sistema que te asigne
        un perfil.
      </Typography>
    );
  }
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 2,
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
      }}
    >
      {shortcuts.map((item) => (
        <Card key={item.path} variant="outlined">
          <CardActionArea component={RouterLink} to={item.path} sx={{ minHeight: 44 }}>
            <CardContent>
              <Typography variant="h6" component="h2">
                {item.label}
              </Typography>
              <Typography color="text.secondary">{item.hint}</Typography>
            </CardContent>
          </CardActionArea>
        </Card>
      ))}
    </Box>
  );
}

function ServiceStatusWidget() {
  return (
    <Stack sx={{ maxWidth: 480 }}>
      <HealthStatus />
    </Stack>
  );
}

/**
 * The component of each widget. Typed by the contract's `WidgetCode`, so a widget the server can assign and the web
 * cannot draw fails the type check instead of showing a blank space.
 */
export const WIDGETS: Record<WidgetCode, ComponentType> = {
  quick_links: QuickLinksWidget,
  quick_create_client: QuickCreateClientWidget,
  service_status: ServiceStatusWidget,
};
