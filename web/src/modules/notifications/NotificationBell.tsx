import NotificationsNoneOutlined from '@mui/icons-material/NotificationsNoneOutlined';
import {
  Alert,
  Badge,
  Box,
  Button,
  CircularProgress,
  IconButton,
  List,
  Popover,
  Typography,
} from '@mui/material';
import type { components } from '@soltec/shared';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { problemMessage } from '../access/messages';
import { NotificationItem } from './NotificationItem';
import { useMarkAllRead, useMarkRead, useNotifications, useUnreadCount } from './useNotifications';

type Notification = components['schemas']['Notification'];

const PANEL_SIZE = 10;

/**
 * The bell of the top bar: how many notifications are unread, and the latest ones in a panel. Each one is the link to
 * what it is about. It asks the server every minute (see `useUnreadCount`) and only reads the list when it is open.
 */
export function NotificationBell() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const unread = useUnreadCount();
  const open = anchor !== null;
  const latest = useNotifications({ limit: PANEL_SIZE, enabled: open });
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();

  const notices = latest.data?.pages.flatMap((page) => page.data) ?? [];
  const opened = (notification: Notification) => {
    setAnchor(null);
    if (!notification.is_read) {
      markRead.mutate(notification.id);
    }
  };

  return (
    <>
      <IconButton
        aria-label={unread > 0 ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'}
        aria-haspopup="dialog"
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={{ minWidth: 44, minHeight: 44 }}
      >
        <Badge badgeContent={unread} max={99} color="error">
          <NotificationsNoneOutlined />
        </Badge>
      </IconButton>
      <Popover
        open={open}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            role: 'dialog',
            'aria-label': 'Notificaciones',
            sx: { width: { xs: 'calc(100vw - 16px)', sm: 420 }, maxHeight: '75vh' },
          },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            px: 2,
            py: 1,
          }}
        >
          <Typography variant="subtitle1" component="h2">
            Notificaciones
          </Typography>
          {/* Reading changes nothing worth confirming: marking all as read acts at once (CLAUDE.md §8, 2026-11-25). */}
          <Button
            size="small"
            disabled={unread === 0 || markAll.isPending}
            onClick={() => markAll.mutate()}
            sx={{ minHeight: 44 }}
          >
            Marcar todas como leídas
          </Button>
        </Box>
        {latest.isError ? (
          <Alert severity="error" sx={{ mx: 2, mb: 1 }}>
            {problemMessage(latest.error)}
          </Alert>
        ) : latest.isPending ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress size={28} aria-label="Cargando las notificaciones" />
          </Box>
        ) : notices.length === 0 ? (
          <Typography color="text.secondary" sx={{ px: 2, pb: 2 }}>
            No tienes notificaciones.
          </Typography>
        ) : (
          <List disablePadding sx={{ overflowY: 'auto' }}>
            {notices.map((notification) => (
              <NotificationItem key={notification.id} notification={notification} onOpen={opened} />
            ))}
          </List>
        )}
        <Box sx={{ borderTop: 1, borderColor: 'divider', p: 1, textAlign: 'center' }}>
          <Button
            component={RouterLink}
            to="/notificaciones"
            onClick={() => setAnchor(null)}
            sx={{ minHeight: 44 }}
          >
            Ver todas
          </Button>
        </Box>
      </Popover>
    </>
  );
}
