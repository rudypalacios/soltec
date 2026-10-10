import { Alert, Box, Stack, Tab, Tabs } from '@mui/material';
import { Link as RouterLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { useIsMobile } from '../../components/useIsMobile';
import { useCan } from '../access/SessionContext';
import { SETTINGS_SECTIONS } from './sections';

/** `/configuracion`: the frame of the settings sections, with a side list on a desktop and tabs on a phone. */
export function SettingsLayout() {
  const can = useCan();
  const isMobile = useIsMobile();
  const { pathname } = useLocation();
  const sections = SETTINGS_SECTIONS.filter((section) => can(section.resource, 'view'));
  const current = sections.find((section) => pathname.startsWith(section.path));

  if (sections.length === 0) {
    return <Alert severity="warning">No tienes permiso para ver esta pantalla.</Alert>;
  }

  return (
    <>
      <PageHeader title="Configuración" />
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 2, md: 4 }}>
        <Tabs
          value={current?.path ?? false}
          orientation={isMobile ? 'horizontal' : 'vertical'}
          variant={isMobile ? 'scrollable' : 'standard'}
          allowScrollButtonsMobile
          aria-label="Secciones de la configuración"
          sx={{
            flexShrink: 0,
            minWidth: { md: 180 },
            borderBottom: { xs: 1, md: 0 },
            borderColor: 'divider',
          }}
        >
          {sections.map((section) => (
            <Tab
              key={section.path}
              component={RouterLink}
              to={section.path}
              value={section.path}
              label={section.label}
              sx={{ alignItems: { md: 'flex-start' }, minHeight: 44 }}
            />
          ))}
        </Tabs>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Outlet />
        </Box>
      </Stack>
    </>
  );
}

/** `/configuracion` alone goes to the first section the user may open. */
export function SettingsIndex() {
  const can = useCan();
  const first = SETTINGS_SECTIONS.find((section) => can(section.resource, 'view'));
  return first ? <Navigate to={first.path} replace /> : null;
}
