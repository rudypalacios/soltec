import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined';
import BusinessOutlined from '@mui/icons-material/BusinessOutlined';
import CategoryOutlined from '@mui/icons-material/CategoryOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ContactsOutlined from '@mui/icons-material/ContactsOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import HomeOutlined from '@mui/icons-material/HomeOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import LocalShippingOutlined from '@mui/icons-material/LocalShippingOutlined';
import ManageAccountsOutlined from '@mui/icons-material/ManageAccountsOutlined';
import PeopleOutline from '@mui/icons-material/PeopleOutline';
import SearchIcon from '@mui/icons-material/Search';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import TaskAltOutlined from '@mui/icons-material/TaskAltOutlined';
import {
  Box,
  ButtonBase,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
} from '@mui/material';
import { useState, type ReactElement } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { useCan, useSessionState } from '../modules/access/SessionContext';
import { color } from '../theme/tokens';
import {
  activeEntry,
  targetOf,
  visibleEntries,
  visibleGroups,
  type NavEntry,
  type NavGroupId,
  type NavId,
} from './navigation';

export const NAV_WIDTH = 252;

/** The icon of each screen. Typed by `NavId`, so a screen added to the menu cannot be left without one. */
const ICONS: Record<NavId, ReactElement> = {
  home: <HomeOutlined />,
  tasks: <TaskAltOutlined />,
  clients: <BusinessOutlined />,
  contacts: <ContactsOutlined />,
  products: <Inventory2Outlined />,
  suppliers: <LocalShippingOutlined />,
  catalog: <CategoryOutlined />,
  users: <PeopleOutline />,
  roles: <ManageAccountsOutlined />,
  departments: <AccountTreeOutlined />,
  audit: <HistoryOutlined />,
  settings: <SettingsOutlined />,
};

const STORAGE_PREFIX = 'soltec.nav.closed.';

/** The groups this person folded, as they left them in this browser. The browser may refuse storage. */
function readClosed(userId: string): NavGroupId[] {
  try {
    const stored: unknown = JSON.parse(
      window.localStorage.getItem(STORAGE_PREFIX + userId) ?? '[]',
    );
    return Array.isArray(stored)
      ? stored.filter((id): id is NavGroupId => typeof id === 'string')
      : [];
  } catch {
    return [];
  }
}

function writeClosed(userId: string, closed: readonly NavGroupId[]): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(closed));
  } catch {
    // Without storage the groups simply start open again next time.
  }
}

/**
 * The side menu: Inicio, then the groups with their screens. A group is drawn only when the person may open one of
 * its screens, every group starts open, and the group of the current screen cannot be folded, so the person never
 * loses sight of where they are. What they fold is remembered for them, in this browser.
 */
export function NavMenu({
  onNavigate,
  onSearch,
}: {
  onNavigate: () => void;
  onSearch: () => void;
}) {
  const can = useCan();
  const state = useSessionState();
  const location = useLocation();
  const userId = state.status === 'authenticated' ? (state.user?.id ?? '') : '';
  // What was folded is read for the person who is signed in, once their name is known (it can arrive after the menu).
  const [stored, setStored] = useState<{ userId: string; closed: NavGroupId[] } | null>(null);
  const closed = stored?.userId === userId ? stored.closed : readClosed(userId);
  const current = activeEntry(visibleEntries(can), location.pathname);

  const toggle = (id: NavGroupId) => {
    const next = closed.includes(id) ? closed.filter((other) => other !== id) : [...closed, id];
    setStored({ userId, closed: next });
    writeClosed(userId, next);
  };

  const item = (entry: NavEntry) => (
    <ListItemButton
      key={entry.id}
      component={NavLink}
      to={targetOf(entry, can)}
      end={entry.path === '/'}
      className={current?.id === entry.id ? 'active' : undefined}
      onClick={onNavigate}
      sx={{
        minHeight: 44,
        pl: 3,
        borderRadius: '0 999px 999px 0',
        '&.active': { bgcolor: color.primary.tint, color: color.primary.dark },
        '&.active .MuiListItemIcon-root': { color: color.primary.main },
        '&.active .MuiListItemText-primary': { fontWeight: 600 },
      }}
    >
      <ListItemIcon sx={{ minWidth: 40 }}>{ICONS[entry.id]}</ListItemIcon>
      <ListItemText primary={entry.label} />
    </ListItemButton>
  );

  const home = visibleEntries(can).find((entry) => entry.group === null);

  return (
    <Box role="navigation" aria-label="Navegación principal" sx={{ width: NAV_WIDTH }}>
      <Toolbar sx={{ px: 3 }}>
        <Brand />
      </Toolbar>
      <Box sx={{ px: 1.5, pb: 1 }}>
        <ButtonBase
          onClick={onSearch}
          aria-label="Buscar pantalla"
          aria-keyshortcuts="Control+K Meta+K"
          sx={{
            width: '100%',
            minHeight: 44,
            gap: 1,
            px: 1.5,
            justifyContent: 'flex-start',
            border: 1,
            borderColor: color.lineStrong,
            borderRadius: 1.5,
            color: 'text.secondary',
            fontSize: 14,
          }}
        >
          <SearchIcon fontSize="small" />
          <Box component="span" sx={{ flex: 1, textAlign: 'left' }}>
            Buscar pantalla…
          </Box>
          <Box
            component="kbd"
            sx={{
              display: { xs: 'none', md: 'inline' },
              fontFamily: 'inherit',
              fontSize: 12,
              px: 0.75,
              py: 0.25,
              border: 1,
              borderColor: 'divider',
              borderRadius: 0.5,
            }}
          >
            Ctrl K
          </Box>
        </ButtonBase>
      </Box>
      <List sx={{ pr: 1.5, pt: 0 }}>
        {home ? item(home) : null}
        {visibleGroups(can).map(({ group, entries }) => {
          const isCurrent = current?.group === group.id;
          const open = isCurrent || !closed.includes(group.id);
          const panel = `nav-group-${group.id}`;
          return (
            <Box component="li" key={group.id} sx={{ listStyle: 'none', mt: 1 }}>
              <ButtonBase
                onClick={() => (isCurrent ? undefined : toggle(group.id))}
                aria-expanded={open}
                aria-controls={panel}
                aria-disabled={isCurrent || undefined}
                sx={{
                  width: '100%',
                  minHeight: 44,
                  pl: 3,
                  pr: 1.5,
                  justifyContent: 'space-between',
                  borderRadius: '0 999px 999px 0',
                  fontSize: 13,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  fontWeight: isCurrent ? 700 : 600,
                  color: isCurrent ? color.primary.dark : 'text.secondary',
                  cursor: isCurrent ? 'default' : 'pointer',
                }}
              >
                {group.label}
                {open ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
              </ButtonBase>
              {open ? (
                <List id={panel} disablePadding aria-label={group.label}>
                  {entries.map(item)}
                </List>
              ) : null}
            </Box>
          );
        })}
      </List>
    </Box>
  );
}
