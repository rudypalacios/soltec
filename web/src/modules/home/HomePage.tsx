import {
  Alert,
  Box,
  Card,
  CardActionArea,
  CardContent,
  Link,
  Stack,
  Typography,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { useCan, useCurrentUser } from '../access/SessionContext';
import { useBranding } from '../settings/useSettings';
import { HealthStatus } from '../system/HealthStatus';

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

/** The landing screen: a greeting, shortcuts to what the user may open and the status of the service. */
export function HomePage() {
  const user = useCurrentUser();
  const can = useCan();
  const shortcuts = SHORTCUTS.filter((item) => can(item.resource, item.action));
  // A new installation has no company data; whoever may edit it is told where to start.
  const companyPending = useBranding().data?.trade_name === '' && can('company', 'edit');

  return (
    <>
      <PageHeader title={user ? `Hola, ${user.name.split(' ')[0]}` : 'Inicio'} />
      {companyPending ? (
        <Alert severity="info" sx={{ mb: 3 }}>
          Faltan los datos de la empresa.{' '}
          <Link component={RouterLink} to="/configuracion/empresa">
            Completarlos
          </Link>
        </Alert>
      ) : null}
      {shortcuts.length > 0 ? (
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
            mb: 3,
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
      ) : (
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Tu cuenta aún no tiene pantallas asignadas. Pide a quien administra el sistema que te
          asigne un perfil.
        </Typography>
      )}
      <Stack sx={{ maxWidth: 480 }}>
        <HealthStatus />
      </Stack>
    </>
  );
}
