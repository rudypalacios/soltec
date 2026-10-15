import { Box, TextField } from '@mui/material';
import type { ReactNode } from 'react';
import { density, touchQuery } from '../theme/tokens';

/**
 * The bar above a list: a search field and, after it, the filters (selects). On a desktop it is one row; on a phone
 * the search takes its own row and the filters share the next ones, so the list starts higher on the screen.
 * The screen's main action (the «Nuevo …» button) goes on the same row as the fields, at the far end, as tall as they
 * are; on a phone it goes first, on its own row.
 */
export function FilterBar({
  searchLabel,
  search,
  onSearchChange,
  beside,
  collapsed = false,
  action,
  children,
}: {
  searchLabel: string;
  search: string;
  onSearchChange: (value: string) => void;
  /** Controls on the search row, after the field (on a phone, the buttons that open the filters). */
  beside?: ReactNode;
  /** Hides the filters, for a phone that opens them on demand. */
  collapsed?: boolean;
  /** The screen's main action, if the person may use it. */
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 1.5,
        mb: 2,
        '& > .MuiTextField-root:not(:first-of-type)': {
          flex: { xs: '1 1 140px', sm: '0 0 auto' },
          minWidth: { sm: 180 },
        },
      }}
    >
      <TextField
        label={searchLabel}
        type="search"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        sx={{
          flex: { xs: beside ? '1 1 0' : '1 1 100%', sm: '1 1 280px' },
          minWidth: { xs: beside ? 0 : undefined },
          maxWidth: { sm: 360 },
        }}
      />
      {beside}
      {collapsed ? null : children}
      {action ? (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'flex-end',
            order: { xs: -1, sm: 0 },
            flex: { xs: '1 1 100%', sm: '0 0 auto' },
            ml: { sm: 'auto' },
            '& .MuiButton-root': {
              minHeight: density.fieldDesktop,
              [touchQuery]: { minHeight: density.fieldTouch },
            },
          }}
        >
          {action}
        </Box>
      ) : null}
    </Box>
  );
}
