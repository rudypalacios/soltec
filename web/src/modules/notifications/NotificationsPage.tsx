import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  List,
  Paper,
  Switch,
  Typography,
} from '@mui/material';
import type { components } from '@soltec/shared';
import { useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { problemMessage } from '../access/messages';
import { NotificationItem } from './NotificationItem';
import { useMarkAllRead, useMarkRead, useNotifications } from './useNotifications';

type Notification = components['schemas']['Notification'];

/** `/notificaciones`: everything the person was told, newest first. Each row opens what it is about. */
export function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const list = useNotifications({ unreadOnly });
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();

  const notices = list.data?.pages.flatMap((page) => page.data) ?? [];
  const unread = list.data?.pages[0]?.meta.unread_count ?? 0;
  const opened = (notification: Notification) => {
    if (!notification.is_read) {
      markRead.mutate(notification.id);
    }
  };

  return (
    <>
      <PageHeader
        title="Notificaciones"
        actions={
          <>
            <FormControlLabel
              control={
                <Switch
                  checked={unreadOnly}
                  onChange={(event) => setUnreadOnly(event.target.checked)}
                />
              }
              label="Solo sin leer"
              sx={{ minHeight: 44, mr: 1 }}
            />
            <Button
              variant="outlined"
              disabled={unread === 0 || markAll.isPending}
              onClick={() => markAll.mutate()}
              sx={{ minHeight: 44 }}
            >
              Marcar todas como leídas
            </Button>
          </>
        }
      />
      {list.isError ? (
        <Alert severity="error">{problemMessage(list.error)}</Alert>
      ) : list.isPending ? (
        <CircularProgress aria-label="Cargando las notificaciones" />
      ) : notices.length === 0 ? (
        <Typography color="text.secondary">
          {unreadOnly ? 'No tienes notificaciones sin leer.' : 'Todavía no tienes notificaciones.'}
        </Typography>
      ) : (
        <Paper variant="outlined">
          <List disablePadding>
            {notices.map((notification) => (
              <Box key={notification.id} sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <NotificationItem notification={notification} onOpen={opened} />
              </Box>
            ))}
          </List>
        </Paper>
      )}
      {list.hasNextPage ? (
        <Box sx={{ textAlign: 'center', mt: 2 }}>
          <Button
            onClick={() => void list.fetchNextPage()}
            disabled={list.isFetchingNextPage}
            sx={{ minHeight: 44 }}
          >
            Ver más
          </Button>
        </Box>
      ) : null}
    </>
  );
}
