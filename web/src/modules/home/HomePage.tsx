import { Alert, CircularProgress, Link, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { problemMessage } from '../access/messages';
import { useCan, useCurrentUser } from '../access/SessionContext';
import { useBranding } from '../settings/useSettings';
import { useDashboard } from './useDashboard';
import { WIDGETS } from './widgets';

/** The landing screen: a greeting and the widgets the user's profiles put on it. */
export function HomePage() {
  const user = useCurrentUser();
  const can = useCan();
  const dashboard = useDashboard();
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
      {dashboard.isError ? (
        <Alert severity="error">{problemMessage(dashboard.error)}</Alert>
      ) : !dashboard.data ? (
        <CircularProgress aria-label="Cargando el inicio" />
      ) : dashboard.data.data.length === 0 ? (
        <Typography color="text.secondary">
          Tu perfil aún no tiene nada en el inicio. Pide a quien administra el sistema que lo
          configure en «Perfiles».
        </Typography>
      ) : (
        <Stack spacing={3}>
          {dashboard.data.data.map(({ code }) => {
            const Widget = WIDGETS[code];
            return <Widget key={code} />;
          })}
        </Stack>
      )}
    </>
  );
}
