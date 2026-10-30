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
import { ContactCreatePage, ContactEditPage } from '../modules/contacts/ContactFormPage';
import { ContactsPage } from '../modules/contacts/ContactsPage';
import {
  SupplierCreatePage,
  SupplierEditPage,
  SupplierViewPage,
} from '../modules/suppliers/SupplierFormPage';
import { ClientDetailPage } from '../modules/clients/ClientDetailPage';
import { ClientCreatePage, ClientEditPage } from '../modules/clients/ClientFormPage';
import { ClientsPage } from '../modules/clients/ClientsPage';
import {
  ProductCreatePage,
  ProductEditPage,
  ProductViewPage,
} from '../modules/products/ProductFormPage';
import {
  BundleCreatePage,
  BundleEditPage,
  BundleViewPage,
} from '../modules/products/BundleFormPage';
import { BundlesPage } from '../modules/products/BundlesPage';
import { ProductsPage } from '../modules/products/ProductsPage';
import { SuppliersPage } from '../modules/suppliers/SuppliersPage';
import { CatalogPage } from '../modules/catalog/CatalogPage';
import { ParametersPage } from '../modules/parameters/ParametersPage';
import { SecurityPage } from '../modules/settings/SecurityPage';
import { SequencesPage } from '../modules/settings/SequencesPage';
import { WorkflowsPage } from '../modules/workflows/WorkflowsPage';
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
        <Route path="catalogo" element={<CatalogPage />} />
        <Route
          path="contactos"
          element={
            <RequirePermission resource="contacts" action="view">
              <ContactsPage />
            </RequirePermission>
          }
        />
        <Route
          path="contactos/nuevo"
          element={
            <RequirePermission resource="contacts" action="create">
              <ContactCreatePage />
            </RequirePermission>
          }
        />
        <Route
          path="contactos/:contactId/editar"
          element={
            <RequirePermission resource="contacts" action="edit">
              <ContactEditPage />
            </RequirePermission>
          }
        />
        <Route
          path="productos"
          element={
            <RequirePermission resource="products" action="view">
              <ProductsPage />
            </RequirePermission>
          }
        />
        <Route
          path="productos/nuevo"
          element={
            <RequirePermission resource="products" action="create">
              <ProductCreatePage />
            </RequirePermission>
          }
        />
        <Route
          path="productos/:productId"
          element={
            <RequirePermission resource="products" action="view">
              <ProductViewPage />
            </RequirePermission>
          }
        />
        <Route
          path="productos/:productId/editar"
          element={
            <RequirePermission resource="products" action="edit">
              <ProductEditPage />
            </RequirePermission>
          }
        />
        <Route
          path="paquetes"
          element={
            <RequirePermission resource="bundles" action="view">
              <BundlesPage />
            </RequirePermission>
          }
        />
        <Route
          path="paquetes/nuevo"
          element={
            <RequirePermission resource="bundles" action="create">
              <BundleCreatePage />
            </RequirePermission>
          }
        />
        <Route
          path="paquetes/:bundleId"
          element={
            <RequirePermission resource="bundles" action="view">
              <BundleViewPage />
            </RequirePermission>
          }
        />
        <Route
          path="paquetes/:bundleId/editar"
          element={
            <RequirePermission resource="bundles" action="edit">
              <BundleEditPage />
            </RequirePermission>
          }
        />
        <Route
          path="clientes"
          element={
            <RequirePermission resource="clients" action="view">
              <ClientsPage />
            </RequirePermission>
          }
        />
        <Route
          path="clientes/nuevo"
          element={
            <RequirePermission resource="clients" action="create">
              <ClientCreatePage />
            </RequirePermission>
          }
        />
        <Route
          path="clientes/:clientId"
          element={
            <RequirePermission resource="clients" action="view">
              <ClientDetailPage />
            </RequirePermission>
          }
        />
        <Route
          path="clientes/:clientId/editar"
          element={
            <RequirePermission resource="clients" action="edit">
              <ClientEditPage />
            </RequirePermission>
          }
        />
        <Route
          path="proveedores"
          element={
            <RequirePermission resource="suppliers" action="view">
              <SuppliersPage />
            </RequirePermission>
          }
        />
        <Route
          path="proveedores/nuevo"
          element={
            <RequirePermission resource="suppliers" action="create">
              <SupplierCreatePage />
            </RequirePermission>
          }
        />
        <Route
          path="proveedores/:supplierId"
          element={
            <RequirePermission resource="suppliers" action="view">
              <SupplierViewPage />
            </RequirePermission>
          }
        />
        <Route
          path="proveedores/:supplierId/editar"
          element={
            <RequirePermission resource="suppliers" action="edit">
              <SupplierEditPage />
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
            path="flujos"
            element={
              <RequirePermission resource="workflow_states" action="view">
                <WorkflowsPage />
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
          <Route path="parametros" element={<ParametersPage />} />
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
