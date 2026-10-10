import MoreVertIcon from '@mui/icons-material/MoreVert';
import { Button, IconButton, ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material';
import { useState, type ReactElement } from 'react';
import { Link as RouterLink } from 'react-router-dom';

/** What a row can do. A link (`to`) navigates; anything else runs `onSelect`. */
export interface RowAction {
  key: string;
  label: string;
  /** Next to the label, from `ACTION_ICONS`. It is decoration: the label says what the action does. */
  icon?: ReactElement;
  to?: string;
  onSelect?: () => void;
  /** Marks an action that is hard to undo (deactivate): shown in the error colour. */
  tone?: 'danger';
}

/** One action as a text button. Its name includes the row's, so a screen reader hears "Editar: Ana", not "Editar". */
export function ActionButton({
  action,
  rowName,
  touch,
}: {
  action: RowAction;
  rowName: string;
  touch?: boolean;
}) {
  return (
    <Button
      size="small"
      color={action.tone === 'danger' ? 'error' : 'primary'}
      startIcon={action.icon}
      aria-label={`${action.label}: ${rowName}`}
      sx={touch ? { minHeight: 44 } : undefined}
      {...(action.to ? { component: RouterLink, to: action.to } : { onClick: action.onSelect })}
    >
      {action.label}
    </Button>
  );
}

/** The actions of a table row behind a ⋮ button, for rows that can have three or more. */
export function ActionMenu({ actions, rowName }: { actions: RowAction[]; rowName: string }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);
  return (
    <>
      <IconButton
        aria-label={`Acciones de ${rowName}`}
        aria-haspopup="menu"
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        <MoreVertIcon />
      </IconButton>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={close}>
        {actions.map((action) =>
          action.to ? (
            <MenuItem key={action.key} component={RouterLink} to={action.to}>
              {action.icon ? <ListItemIcon>{action.icon}</ListItemIcon> : null}
              <ListItemText>{action.label}</ListItemText>
            </MenuItem>
          ) : (
            <MenuItem
              key={action.key}
              sx={action.tone === 'danger' ? { color: 'error.main' } : undefined}
              onClick={() => {
                close();
                action.onSelect?.();
              }}
            >
              {action.icon ? (
                <ListItemIcon sx={{ color: 'inherit' }}>{action.icon}</ListItemIcon>
              ) : null}
              <ListItemText>{action.label}</ListItemText>
            </MenuItem>
          ),
        )}
      </Menu>
    </>
  );
}
