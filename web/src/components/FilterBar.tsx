import CloseIcon from '@mui/icons-material/Close';
import { Box, Button, Chip, Paper, Stack, TextField } from '@mui/material';
import { useState, type ReactNode } from 'react';
import { density, touchQuery } from '../theme/tokens';

/** A filter that is not at its default, shown as a chip that clears it. */
export interface ActiveFilter {
  id: string;
  /** What it filters («Tipo»). */
  label: string;
  /** What it is set to («Prospecto»). */
  value: string;
  onClear: () => void;
}

/**
 * Puts the filters in a panel behind a «Filtros» button with the number of active ones, and shows the active ones as
 * chips under the bar. The row of the bar then never changes, however many filters a screen has.
 */
export interface FilterPanel {
  active: ActiveFilter[];
  onClearAll: () => void;
}

/** The height of a control that sits in the row of the bar: as tall as the fields. */
const AS_TALL_AS_A_FIELD = {
  minHeight: density.fieldDesktop,
  [touchQuery]: { minHeight: density.fieldTouch },
} as const;

/** The number of active filters, a small pill on the «Filtros» button. */
const COUNTER = {
  ml: 1,
  minWidth: 20,
  height: 20,
  px: 0.75,
  borderRadius: 10,
  display: 'inline-grid',
  placeItems: 'center',
  fontSize: 12,
  lineHeight: 1,
  color: 'primary.contrastText',
  bgcolor: 'primary.main',
} as const;

/**
 * The bar above a list: a search field and, after it, the filters (selects). On a desktop it is one row; on a phone
 * the search takes its own row and the filters share the next ones, so the list starts higher on the screen.
 * The screen's main action (the «Nuevo …» button) goes on the same row as the fields, at the far end, as tall as they
 * are; on a phone it goes first, on its own row.
 *
 * A screen with more than a couple of filters passes `panel`: the filters (the children) then live in a panel that
 * the «Filtros» button opens, at every width, and the active ones show as chips.
 */
export function FilterBar({
  searchLabel,
  search,
  onSearchChange,
  beside,
  collapsed = false,
  action,
  panel,
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
  /** Moves the filters into a panel with a counter and chips. */
  panel?: FilterPanel;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const count = panel?.active.length ?? 0;
  const shortSearch = Boolean(beside || panel);

  return (
    <Box sx={{ mb: 2 }}>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1.5,
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
            flex: { xs: shortSearch ? '1 1 0' : '1 1 100%', sm: '1 1 280px' },
            minWidth: { xs: shortSearch ? 0 : undefined },
            maxWidth: { sm: 360 },
          }}
        />
        {panel ? (
          <Button
            variant="outlined"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            sx={AS_TALL_AS_A_FIELD}
          >
            Filtros
            {count > 0 ? (
              <Box component="span" sx={COUNTER}>
                {count}
              </Box>
            ) : null}
          </Button>
        ) : null}
        {beside}
        {collapsed || panel ? null : children}
        {action ? (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'flex-end',
              order: { xs: -1, sm: 0 },
              flex: { xs: '1 1 100%', sm: '0 0 auto' },
              ml: { sm: 'auto' },
              '& .MuiButton-root': AS_TALL_AS_A_FIELD,
            }}
          >
            {action}
          </Box>
        ) : null}
      </Box>

      {panel && count > 0 ? (
        <Stack
          direction="row"
          aria-label="Filtros activos"
          sx={{ mt: 1.5, gap: 1, flexWrap: 'wrap', alignItems: 'center' }}
        >
          {panel.active.map((filter) => (
            <Chip
              key={filter.id}
              variant="outlined"
              sx={{ [touchQuery]: { height: 36 } }}
              label={`${filter.label}: ${filter.value}`}
              onDelete={filter.onClear}
              deleteIcon={<CloseIcon aria-label={`Quitar el filtro ${filter.label}`} />}
            />
          ))}
          <Button size="small" onClick={panel.onClearAll}>
            Limpiar
          </Button>
        </Stack>
      ) : null}

      {panel && open ? (
        <>
          <Paper
            variant="outlined"
            sx={{
              mt: 1.5,
              p: 2,
              display: 'grid',
              gap: 2,
              alignItems: 'center',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            }}
          >
            {children}
          </Paper>
        </>
      ) : null}
    </Box>
  );
}
