import DevicesOutlined from '@mui/icons-material/DevicesOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
import ManageAccountsOutlined from '@mui/icons-material/ManageAccountsOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import PeopleOutline from '@mui/icons-material/PeopleOutline';
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined';
import CategoryOutlined from '@mui/icons-material/CategoryOutlined';
import ContactsOutlined from '@mui/icons-material/ContactsOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import LocalShippingOutlined from '@mui/icons-material/LocalShippingOutlined';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import HomeOutlined from '@mui/icons-material/HomeOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import {
  AppBar,
  Box,
  Button,
  Container,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Typography,
} from '@mui/material';
import { useState, type ReactElement, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useCan, useSession, useSessionState } from '../modules/access/SessionContext';
import { CATALOG_VIEWS } from '../modules/parameters/parameterViews';
import { SETTINGS_SECTIONS } from '../modules/settings/sections';
import { color } from '../theme/tokens';
import { Brand } from './Brand';
import { useIsMobile } from './useIsMobile';

const DRAWER_WIDTH = 232;

interface NavItem {
  label: string;
  path: string;
  icon: ReactElement;
  /** Without permissions the item is for every signed-in user; with several, any one of them is enough. */
  permissions?: { resource: string; action: string }[];
  /** For an item that opens one of several screens: the address to use for whoever may view this one first. */
  fallbacks?: { path: string; resource: string }[];
  /** Other addresses that keep the item highlighted (the tabs of the same section). */
  alsoActiveOn?: string[];
}

/** The side navigation. Each item shows only to whoever may open it; the server enforces it anyway. */
const NAV_ITEMS: NavItem[] = [
  { label: 'Inicio', path: '/', icon: <HomeOutlined /> },
  {
    label: 'Usuarios',
    path: '/usuarios',
    icon: <PeopleOutline />,
    permissions: [{ resource: 'users', action: 'view' }],
  },
  {
    label: 'Perfiles',
    path: '/perfiles',
    icon: <ManageAccountsOutlined />,
    permissions: [{ resource: 'roles', action: 'view' }],
  },
  {
    label: 'Departamentos',
    path: '/departamentos',
    icon: <AccountTreeOutlined />,
    permissions: [{ resource: 'departments', action: 'view' }],
  },
  {
    label: 'Contactos',
    path: '/contactos',
    icon: <ContactsOutlined />,
    permissions: [{ resource: 'contacts', action: 'view' }],
  },
  {
    label: 'Productos',
    path: '/productos',
    icon: <Inventory2Outlined />,
    // Products and bundles are tabs of one section: the item opens the first one the person may view.
    permissions: [
      { resource: 'products', action: 'view' },
      { resource: 'bundles', action: 'view' },
    ],
    fallbacks: [{ path: '/paquetes', resource: 'bundles' }],
    alsoActiveOn: ['/paquetes'],
  },
  {
    label: 'Proveedores',
    path: '/proveedores',
    icon: <LocalShippingOutlined />,
    permissions: [{ resource: 'suppliers', action: 'view' }],
  },
  {
    label: 'Catálogo',
    path: '/catalogo',
    icon: <CategoryOutlined />,
    permissions: CATALOG_VIEWS.map((view) => ({ resource: view.resource, action: 'view' })),
  },
  {
    label: 'Auditoría',
    path: '/auditoria',
    icon: <HistoryOutlined />,
    permissions: [{ resource: 'audit_logs', action: 'view' }],
  },
  {
    label: 'Configuración',
    path: '/configuracion',
    icon: <SettingsOutlined />,
    permissions: SETTINGS_SECTIONS.flatMap((section) =>
      section.resources.map((resource) => ({ resource, action: 'view' })),
    ),
  },
];

/** Where an item leads: its own address, or the first alternative the person may open when they cannot view it. */
function targetOf(item: NavItem, can: (resource: string, action: string) => boolean): string {
  const own = item.permissions?.[0];
  if (!own || can(own.resource, own.action)) {
    return item.path;
  }
  return item.fallbacks?.find((fallback) => can(fallback.resource, 'view'))?.path ?? item.path;
}

/** Whether the current address belongs to the section of an item without being its own address. */
function isAlsoActive(item: NavItem, pathname: string): boolean {
  return (item.alsoActiveOn ?? []).some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * The frame of every signed-in screen: a fixed side menu on a desktop, a drawer behind a button on a phone.
 * While the password has to be changed there is no menu: the only way forward is the change itself.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const state = useSessionState();
  const can = useCan();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const restricted = state.status === 'authenticated' && state.passwordChangeRequired;
  const location = useLocation();
  const items = restricted
    ? []
    : NAV_ITEMS.filter(
        (item) => !item.permissions || item.permissions.some((p) => can(p.resource, p.action)),
      );

  const navigation = (
    <Box role="navigation" aria-label="Navegación principal" sx={{ width: DRAWER_WIDTH }}>
      <Toolbar sx={{ px: 3 }}>
        <Brand />
      </Toolbar>
      <List sx={{ pr: 1.5 }}>
        {items.map((item) => (
          <ListItemButton
            key={item.path}
            component={NavLink}
            to={targetOf(item, can)}
            end={item.path === '/'}
            className={isAlsoActive(item, location.pathname) ? 'active' : undefined}
            onClick={() => setDrawerOpen(false)}
            sx={{
              minHeight: 44,
              pl: 3,
              borderRadius: '0 999px 999px 0',
              '&.active': { bgcolor: color.primary.tint, color: color.primary.dark },
              '&.active .MuiListItemIcon-root': { color: color.primary.main },
              '&.active .MuiListItemText-primary': { fontWeight: 600 },
            }}
          >
            <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        color="inherit"
        elevation={0}
        sx={{
          borderBottom: 1,
          borderColor: 'divider',
          ml: { md: items.length > 0 ? `${DRAWER_WIDTH}px` : 0 },
          width: { md: items.length > 0 ? `calc(100% - ${DRAWER_WIDTH}px)` : '100%' },
        }}
      >
        <Toolbar>
          {items.length > 0 && isMobile ? (
            <IconButton
              edge="start"
              aria-label="Abrir el menú"
              onClick={() => setDrawerOpen(true)}
              sx={{ mr: 1 }}
            >
              <MenuIcon />
            </IconButton>
          ) : null}
          <Box sx={{ display: { xs: 'block', md: restricted ? 'block' : 'none' } }}>
            <Brand />
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          <UserMenu />
        </Toolbar>
      </AppBar>

      {items.length > 0 ? (
        isMobile ? (
          <Drawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            ModalProps={{ keepMounted: true }}
          >
            {navigation}
          </Drawer>
        ) : (
          <Drawer
            variant="permanent"
            sx={{
              width: DRAWER_WIDTH,
              flexShrink: 0,
              '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
            }}
          >
            {navigation}
          </Drawer>
        )
      ) : null}

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
        <Toolbar />
        <Container maxWidth="xl" sx={{ py: { xs: 2, md: 3 }, px: { xs: 2, md: 3 } }}>
          {children}
        </Container>
      </Box>
    </Box>
  );
}

function UserMenu() {
  const session = useSession();
  const state = useSessionState();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  if (state.status !== 'authenticated') {
    return null;
  }
  const name = state.user?.name ?? 'Mi cuenta';

  const close = () => setAnchor(null);
  const signOut = async () => {
    close();
    await session.logout();
    navigate('/ingresar', { replace: true });
  };

  return (
    <>
      <Button
        color="inherit"
        onClick={(event) => setAnchor(event.currentTarget)}
        aria-haspopup="menu"
        aria-label={`Cuenta de ${name}`}
        sx={{ textTransform: 'none', maxWidth: { xs: 160, md: 280 } }}
      >
        <Typography noWrap sx={{ fontSize: 14 }}>
          {isMobile ? name.split(' ')[0] : name}
        </Typography>
      </Button>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={close}>
        {state.passwordChangeRequired ? null : (
          <MenuItem
            onClick={() => {
              close();
              navigate('/cambiar-contrasena');
            }}
            sx={{ minHeight: 44 }}
          >
            <ListItemIcon>
              <LockOutlined fontSize="small" />
            </ListItemIcon>
            Cambiar contraseña
          </MenuItem>
        )}
        {state.passwordChangeRequired ? null : (
          <MenuItem
            onClick={() => {
              close();
              navigate('/cuenta/sesiones');
            }}
            sx={{ minHeight: 44 }}
          >
            <ListItemIcon>
              <DevicesOutlined fontSize="small" />
            </ListItemIcon>
            Mis sesiones
          </MenuItem>
        )}
        {state.passwordChangeRequired ? null : <Divider />}
        <MenuItem onClick={() => void signOut()} sx={{ minHeight: 44 }}>
          <ListItemIcon>
            <LogoutOutlined fontSize="small" />
          </ListItemIcon>
          Cerrar sesión
        </MenuItem>
      </Menu>
    </>
  );
}
