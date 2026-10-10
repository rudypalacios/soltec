import { Box, TextField } from '@mui/material';
import type { ReactNode } from 'react';

/**
 * The bar above a list: a search field and, after it, the filters (selects). On a desktop it is one row; on a phone
 * the search takes its own row and the filters share the next ones, so the list starts higher on the screen.
 */
export function FilterBar({
  searchLabel,
  search,
  onSearchChange,
  children,
}: {
  searchLabel: string;
  search: string;
  onSearchChange: (value: string) => void;
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
        sx={{ flex: { xs: '1 1 100%', sm: '1 1 280px' }, maxWidth: { sm: 360 } }}
      />
      {children}
    </Box>
  );
}
