import { Alert, Box, Button, Container, Typography } from '@mui/material';
import { Link as RouterLink, Route, Routes } from 'react-router-dom';
import { ChangePasswordPage } from '../modules/access/ChangePasswordPage';
import {
  ACCEPT_INVITATION_PATH,
  CHANGE_PASSWORD_PATH,
  FORGOT_PASSWORD_PATH,
  LOGIN_PATH,
  RESET_PASSWORD_PATH,
  RequireAuth,
  RequirePermission,
} from '../modules/access/guards';
import { ForgotPasswordPage } from '../modules/access/ForgotPasswordPage';
import { LoginPage } from '../modules/access/LoginPage';
import { RoleFormPage } from '../modules/access/RoleFormPage';
import { RolesPage } from '../modules/access/RolesPage';
import { SessionsPage } from '../modules/access/SessionsPage';
import { AcceptInvitationPage, ResetPasswordPage } from '../modules/access/SetPasswordPage';
import { UserCreatePage } from '../modules/access/UserCreatePage';
import { UserEditPage } from '../modules/access/UserEditPage';
import { UsersPage } from '../modules/access/UsersPage';
import { AuditPage } from '../modules/audit/AuditPage';
import { HomePage } from '../modules/home/HomePage';
import { DepartmentsPage } from '../modules/organization/DepartmentsPage';
import { CompanyPage } from '../modules/settings/CompanyPage';
import { FinancialPage } from '../modules/settings/FinancialPage';
import { MarginLevelsPage } from '../modules/settings/MarginLevelsPage';
import { SecurityPage } from '../modules/settings/SecurityPage';
import { SequencesPage } from '../modules/settings/SequencesPage';
import { useBranding } from '../modules/settings/useSettings';
import { SettingsIndex, SettingsLayout } from '../modules/settings/SettingsLayout';
import { RequirementsPage } from '../modules/system/RequirementsPage';

/** Route table. The paths are in Spanish because the user sees them (docs/arquitectura/glosario.md). */
export function App() {
  // Starts the brand request now, in parallel with restoring the session, so the logo is not waited for twice.
  useBranding();

  return (
    <Routes>
      <Route path={LOGIN_PATH} element={<LoginPage />} />
      <Route path={FORGOT_PASSWORD_PATH} element={<ForgotPasswordPage />} />
      <Route path={ACCEPT_INVITATION_PATH} element={<AcceptInvitationPage />} />
      <Route path={RESET_PASSWORD_PATH} element={<ResetPasswordPage />} />
      {/* Server diagnostics, open on purpose (see TODO.md): it carries no session. */}
      <Route
        path="/requisitos"
        element={
          <Container sx={{ py: 3 }}>
            <RequirementsPage />
          </Container>
        }
      />
      <Route element={<RequireAuth />}>
        <Route index element={<HomePage />} />
        <Route path={CHANGE_PASSWORD_PATH.slice(1)} element={<ChangePasswordPage />} />
        <Route path="cuenta/sesiones" element={<SessionsPage />} />
        <Route
          path="usuarios"
          element={
            <RequirePermission resource="users" action="view">
              <UsersPage />
            </RequirePermission>
          }
        />
        <Route
          path="usuarios/nuevo"
          element={
            <RequirePermission resource="users" action="create">
              <UserCreatePage />
            </RequirePermission>
          }
        />
        <Route
          path="usuarios/:userId/editar"
          element={
            <RequirePermission resource="users" action="edit">
              <UserEditPage />
            </RequirePermission>
          }
        />
        <Route
          path="perfiles"
          element={
            <RequirePermission resource="roles" action="view">
              <RolesPage />
            </RequirePermission>
          }
        />
        <Route
          path="perfiles/nuevo"
          element={
            <RequirePermission resource="roles" action="create">
              <RoleFormPage />
            </RequirePermission>
          }
        />
        <Route
          path="perfiles/:roleId"
          element={
            <RequirePermission resource="roles" action="view">
              <RoleFormPage />
            </RequirePermission>
          }
        />
        <Route
          path="departamentos"
          element={
            <RequirePermission resource="departments" action="view">
              <DepartmentsPage />
            </RequirePermission>
          }
        />
        <Route
          path="auditoria"
          element={
            <RequirePermission resource="audit_logs" action="view">
              <AuditPage />
            </RequirePermission>
          }
        />
        <Route path="configuracion" element={<SettingsLayout />}>
          <Route index element={<SettingsIndex />} />
          <Route
            path="empresa"
            element={
              <RequirePermission resource="company" action="view">
                <CompanyPage />
              </RequirePermission>
            }
          />
          <Route
            path="finanzas"
            element={
              <RequirePermission resource="financial_settings" action="view">
                <FinancialPage />
              </RequirePermission>
            }
          />
          <Route
            path="margenes"
            element={
              <RequirePermission resource="margin_levels" action="view">
                <MarginLevelsPage />
              </RequirePermission>
            }
          />
          <Route
            path="numeracion"
            element={
              <RequirePermission resource="sequences" action="view">
                <SequencesPage />
              </RequirePermission>
            }
          />
          <Route
            path="seguridad"
            element={
              <RequirePermission resource="security_settings" action="view">
                <SecurityPage />
              </RequirePermission>
            }
          />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function NotFound() {
  return (
    <Box sx={{ p: 2 }}>
      <Alert severity="info" sx={{ mb: 2 }}>
        <Typography>Esa pantalla no existe.</Typography>
      </Alert>
      <Button component={RouterLink} to="/">
        Ir al inicio
      </Button>
    </Box>
  );
}
