import { Alert } from '@mui/material';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { SectionNav } from '../../components/SectionNav';
import { useCan } from '../access/SessionContext';
import { SETTINGS_SECTIONS } from './sections';

/** `/configuracion`: the frame of the settings sections, with a side list on a desktop and tabs on a phone. */
export function SettingsLayout() {
  const can = useCan();
  const { pathname } = useLocation();
  const sections = SETTINGS_SECTIONS.filter((section) =>
    section.resources.some((resource) => can(resource, 'view')),
  );
  const current = sections.find((section) => pathname.startsWith(section.path));

  if (sections.length === 0) {
    return <Alert severity="warning">No tienes permiso para ver esta pantalla.</Alert>;
  }

  return (
    <>
      <PageHeader title="Configuración" />
      <SectionNav
        label="Secciones de la configuración"
        value={current?.path ?? false}
        items={sections.map((section) => ({
          value: section.path,
          label: section.label,
          to: section.path,
        }))}
      >
        <Outlet />
      </SectionNav>
    </>
  );
}

/** `/configuracion` alone goes to the first section the user may open. */
export function SettingsIndex() {
  const can = useCan();
  const first = SETTINGS_SECTIONS.find((section) =>
    section.resources.some((resource) => can(resource, 'view')),
  );
  return first ? <Navigate to={first.path} replace /> : null;
}
