import { Box, ListItemButton, Typography } from '@mui/material';
import type { components } from '@soltec/shared';
import { Link as RouterLink } from 'react-router-dom';
import { color } from '../../theme/tokens';
import { notificationPath, notificationText, timeAgo } from './notificationText';

type Notification = components['schemas']['Notification'];

/**
 * One notification. The whole row is the link: a click opens the task or the client it is about, and `onOpen` marks it
 * read. It is a real link, so it also opens in another tab.
 */
export function NotificationItem({
  notification,
  onOpen,
}: {
  notification: Notification;
  onOpen: (notification: Notification) => void;
}) {
  return (
    <ListItemButton
      component={RouterLink}
      to={notificationPath(notification)}
      onClick={() => onOpen(notification)}
      sx={{
        alignItems: 'flex-start',
        gap: 1.5,
        minHeight: 56,
        py: 1.25,
        bgcolor: notification.is_read ? undefined : color.primary.tint,
      }}
    >
      <Box
        aria-hidden
        sx={{
          flexShrink: 0,
          width: 8,
          height: 8,
          mt: 0.9,
          borderRadius: '50%',
          bgcolor: notification.is_read ? 'transparent' : color.primary.main,
        }}
      />
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: notification.is_read ? 400 : 600, overflowWrap: 'anywhere' }}>
          {notificationText(notification)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {notification.is_read ? '' : 'Sin leer · '}
          {timeAgo(notification.created_at)}
        </Typography>
      </Box>
    </ListItemButton>
  );
}
