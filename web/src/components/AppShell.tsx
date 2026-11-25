import DevicesOutlined from '@mui/icons-material/DevicesOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import {
  AppBar,
  Box,
  Button,
  Container,
  Divider,
  Drawer,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Toolbar,
  Typography,
} from '@mui/material';
import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCan, useSession, useSessionState } from '../modules/access/SessionContext';
import { NotificationBell } from '../modules/notifications/NotificationBell';
import { NavMenu, NAV_WIDTH } from '../navigation/NavMenu';
import { NavSearchDialog } from '../navigation/NavSearchDialog';
import { activeEntry, groupLabel, visibleEntries } from '../navigation/navigation';
import { Brand } from './Brand';
import { useIsMobile } from './useIsMobile';

/**
 * The frame of every signed-in screen: a fixed side menu on a desktop, a drawer behind a button on a phone.
 * While the password has to be changed there is no menu: the only way forward is the change itself.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const state = useSessionState();
  const can = useCan();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const restricted = state.status === 'authenticated' && state.passwordChangeRequired;
  const location = useLocation();
  const entries = restricted ? [] : visibleEntries(can);
  const hasMenu = entries.length > 0;
  const current = activeEntry(entries, location.pathname);

  // Ctrl+K (⌘K on a Mac) opens the search from anywhere. It takes the shortcut some browsers use for their own search.
  useEffect(() => {
    if (!hasMenu) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasMenu]);

  const navigation = (
    <NavMenu
      onNavigate={() => setDrawerOpen(false)}
      onSearch={() => {
        setDrawerOpen(false);
        setSearchOpen(true);
      }}
    />
  );
  // «Comercial › Clientes» on a desktop; on a phone, the name of the screen in place of the brand.
  const crumbs = current?.group
    ? `${groupLabel(current.group)} › ${current.label}`
    : current?.label;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        color="inherit"
        elevation={0}
        sx={{
          borderBottom: 1,
          borderColor: 'divider',
          ml: { md: hasMenu ? `${NAV_WIDTH}px` : 0 },
          width: { md: hasMenu ? `calc(100% - ${NAV_WIDTH}px)` : '100%' },
        }}
      >
        <Toolbar>
          {hasMenu && isMobile ? (
            <IconButton
              edge="start"
              aria-label="Abrir el menú"
              onClick={() => setDrawerOpen(true)}
              sx={{ mr: 1 }}
            >
              <MenuIcon />
            </IconButton>
          ) : null}
          {current && hasMenu ? (
            <Typography
              component="span"
              noWrap
              sx={{ fontSize: { xs: 18, md: 14 }, fontWeight: { xs: 700, md: 400 }, minWidth: 0 }}
              aria-label="Ruta"
            >
              {isMobile ? current.label : crumbs}
            </Typography>
          ) : (
            <Box sx={{ display: { xs: 'block', md: restricted ? 'block' : 'none' } }}>
              <Brand />
            </Box>
          )}
          <Box sx={{ flexGrow: 1 }} />
          {hasMenu ? <NotificationBell /> : null}
          <UserMenu />
        </Toolbar>
      </AppBar>

      {hasMenu ? (
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
              width: NAV_WIDTH,
              flexShrink: 0,
              '& .MuiDrawer-paper': { width: NAV_WIDTH, boxSizing: 'border-box' },
            }}
          >
            {navigation}
          </Drawer>
        )
      ) : null}

      {hasMenu ? <NavSearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} /> : null}

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
