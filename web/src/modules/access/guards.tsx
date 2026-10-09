import { Alert, Box, CircularProgress } from '@mui/material';
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { useCan, useSessionState } from './SessionContext';

export const LOGIN_PATH = '/ingresar';
export const CHANGE_PASSWORD_PATH = '/cambiar-contrasena';
export const FORGOT_PASSWORD_PATH = '/recuperar-contrasena';
export const ACCEPT_INVITATION_PATH = '/aceptar-invitacion';
export const RESET_PASSWORD_PATH = '/restablecer-contrasena';

/**
 * Everything behind the sign-in. It waits while the session is recovered, sends anonymous visitors to the login
 * (remembering where they were going) and keeps anyone who must change their password on that screen.
 */
export function RequireAuth() {
  const state = useSessionState();
  const location = useLocation();

  if (state.status === 'restoring') {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <CircularProgress aria-label="Recuperando tu sesión" />
      </Box>
    );
  }
  if (state.status === 'anonymous') {
    return (
      <Navigate to={LOGIN_PATH} replace state={{ from: location.pathname + location.search }} />
    );
  }
  if (state.passwordChangeRequired && location.pathname !== CHANGE_PASSWORD_PATH) {
    return <Navigate to={CHANGE_PASSWORD_PATH} replace />;
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

/** Shows its screen only to who holds the permission; otherwise says so. The server answers 403 regardless. */
export function RequirePermission({
  resource,
  action,
  children,
}: {
  resource: string;
  action: string;
  children: ReactNode;
}) {
  const can = useCan();

  return can(resource, action) ? (
    children
  ) : (
    <Alert severity="warning">No tienes permiso para ver esta pantalla.</Alert>
  );
}
