import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from '@mui/material';
import type { ReactNode } from 'react';
import { ActionButton, ActionMenu, type RowAction } from './RowActions';
import { useIsMobile } from './useIsMobile';

/**
 * How a column shows on a phone, where a row becomes a card: the main line, the line under it, the badge at the
 * corner, a labelled detail, or not at all (secondary data the card can do without).
 */
export type MobileRole = 'title' | 'subtitle' | 'badge' | 'meta' | 'hidden';

export interface DataColumn<T> {
  id: string;
  header: string;
  render: (row: T) => ReactNode;
  mobile: MobileRole;
  /** For a `meta` column: show the header before the content ("Último acceso: Nunca"). Defaults to true. */
  mobileLabel?: boolean;
  /** Table only: keep the cell on one line (dates, states) so the width goes to the columns that can wrap. */
  nowrap?: boolean;
  /** Table only: the narrowest the column may get, in px, so a long name wraps in two lines and not five. */
  minWidth?: number;
}

interface DataListProps<T> {
  /** Accessible name of the table or list, e.g. "Lista de usuarios". */
  label: string;
  /** What to call a thing in the messages, in the plural: "usuarios". */
  noun: string;
  columns: DataColumn<T>[];
  /** `undefined` while loading. */
  rows: T[] | undefined;
  /** The message to show instead of the rows when the request failed. */
  error?: string | null;
  getRowId: (row: T) => string;
  /** Names a row for the screen reader in its action buttons. */
  getRowName: (row: T) => string;
  getActions?: (row: T) => RowAction[];
  /**
   * For a long list of short rows (a dozen levels, not a dozen people): on a phone each row is one compact line
   * (title and subtitle on the left, the badges on the right, every action behind ⋮) instead of a card.
   */
  dense?: boolean;
  /** Omit it for a list that is never long (a handful of fixed rows). */
  pagination?: {
    /** Zero-based. */
    page: number;
    perPage: number;
    total: number;
    onPageChange: (page: number) => void;
  };
}

/** Text for screen readers only (the same recipe as MUI's `visuallyHidden`). */
const visuallyHidden = {
  border: 0,
  clip: 'rect(0 0 0 0)',
  height: '1px',
  margin: -1,
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: '1px',
} as const;

/**
 * The list every catalogue screen shares: a table from `md` up, a list of cards below it, with its loading, error and
 * empty states and its pagination. Columns say how they look in each layout, so a screen declares its data once.
 */
export function DataList<T>({
  label,
  noun,
  columns,
  rows,
  error,
  getRowId,
  getRowName,
  getActions,
  dense = false,
  pagination,
}: DataListProps<T>) {
  const isMobile = useIsMobile();

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }
  if (rows === undefined) {
    return <CircularProgress aria-label={`Cargando ${noun}`} />;
  }
  if (rows.length === 0) {
    return <Alert severity="info">No hay {noun} con esos filtros.</Alert>;
  }

  return (
    <>
      {isMobile && dense ? (
        <Paper
          component="ul"
          variant="outlined"
          aria-label={label}
          sx={{ listStyle: 'none', m: 0, p: 0, overflow: 'hidden' }}
        >
          {rows.map((row) => (
            <DenseRow
              key={getRowId(row)}
              row={row}
              columns={columns}
              rowName={getRowName(row)}
              actions={getActions?.(row) ?? []}
            />
          ))}
        </Paper>
      ) : isMobile ? (
        <Stack
          component="ul"
          spacing={1.5}
          aria-label={label}
          sx={{ listStyle: 'none', m: 0, p: 0 }}
        >
          {rows.map((row) => (
            <li key={getRowId(row)}>
              <RowCard
                row={row}
                columns={columns}
                rowName={getRowName(row)}
                actions={getActions?.(row) ?? []}
              />
            </li>
          ))}
        </Stack>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" aria-label={label}>
            <TableHead>
              <TableRow>
                {columns.map((column) => (
                  <TableCell key={column.id} sx={{ minWidth: column.minWidth }}>
                    {column.header}
                  </TableCell>
                ))}
                {getActions ? (
                  <TableCell align="right" sx={{ position: 'relative' }}>
                    <Box component="span" sx={visuallyHidden}>
                      Acciones
                    </Box>
                  </TableCell>
                ) : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                const actions = getActions?.(row) ?? [];
                const rowName = getRowName(row);
                return (
                  <TableRow key={getRowId(row)} hover>
                    {columns.map((column) => (
                      <TableCell
                        key={column.id}
                        sx={column.nowrap ? { whiteSpace: 'nowrap' } : undefined}
                      >
                        {column.render(row)}
                      </TableCell>
                    ))}
                    {getActions ? (
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap', py: 0.5 }}>
                        {actions.length > 0 ? (
                          <ActionMenu actions={actions} rowName={rowName} />
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {pagination ? (
        <TablePagination
          component="div"
          count={pagination.total}
          page={pagination.page}
          onPageChange={(_, next) => pagination.onPageChange(next)}
          rowsPerPage={pagination.perPage}
          rowsPerPageOptions={[]}
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
          sx={{ '.MuiTablePagination-toolbar': { px: 0 } }}
        />
      ) : null}
    </>
  );
}

function RowCard<T>({
  row,
  columns,
  rowName,
  actions,
}: {
  row: T;
  columns: DataColumn<T>[];
  rowName: string;
  actions: RowAction[];
}) {
  const withRole = (role: MobileRole) => columns.filter((column) => column.mobile === role);
  const [title] = withRole('title');
  const [subtitle] = withRole('subtitle');
  const badges = withRole('badge');
  const meta = withRole('meta');
  // One button always in sight and the rest behind ⋮: the footer is one row however many actions a row has.
  const [primary, ...others] = actions;

  return (
    <Card variant="outlined">
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
        >
          <Box sx={{ minWidth: 0 }}>
            {title ? (
              <Typography component="div" sx={{ fontWeight: 600 }}>
                {title.render(row)}
              </Typography>
            ) : null}
            {subtitle ? (
              <Typography component="div" variant="body2" color="text.secondary" noWrap>
                {subtitle.render(row)}
              </Typography>
            ) : null}
          </Box>
          {badges.map((badge) => (
            <Box key={badge.id} sx={{ flexShrink: 0, pt: 0.25 }}>
              {badge.render(row)}
            </Box>
          ))}
        </Stack>
        {meta.length > 0 ? (
          <Stack spacing={0.75} sx={{ mt: 1.5 }}>
            {meta.map((column) => (
              <Typography key={column.id} component="div" variant="body2" color="text.secondary">
                {column.mobileLabel === false ? null : `${column.header}: `}
                {column.render(row)}
              </Typography>
            ))}
          </Stack>
        ) : null}
      </CardContent>
      {primary ? (
        <Stack
          direction="row"
          sx={{
            borderTop: 1,
            borderColor: 'divider',
            alignItems: 'center',
            justifyContent: 'space-between',
            pl: 1,
            pr: 0.5,
            py: 0.5,
          }}
        >
          <ActionButton action={primary} rowName={rowName} touch />
          {others.length > 0 ? <ActionMenu actions={others} rowName={rowName} /> : null}
        </Stack>
      ) : null}
    </Card>
  );
}

/** One compact line of a dense list on a phone; at least 56 px tall so it stays a touch target. */
function DenseRow<T>({
  row,
  columns,
  rowName,
  actions,
}: {
  row: T;
  columns: DataColumn<T>[];
  rowName: string;
  actions: RowAction[];
}) {
  const withRole = (role: MobileRole) => columns.filter((column) => column.mobile === role);
  const [title] = withRole('title');
  const [subtitle] = withRole('subtitle');
  const badges = withRole('badge');

  return (
    <Box
      component="li"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        minHeight: 56,
        pl: 1.5,
        pr: 0.5,
        py: 0.5,
        borderTop: 1,
        borderColor: 'divider',
        '&:first-of-type': { borderTop: 0 },
      }}
    >
      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        {title ? (
          <Typography component="div" sx={{ fontWeight: 600 }}>
            {title.render(row)}
          </Typography>
        ) : null}
        {subtitle ? (
          <Typography component="div" variant="body2" color="text.secondary" noWrap>
            {subtitle.render(row)}
          </Typography>
        ) : null}
      </Box>
      {badges.map((badge) => (
        <Box key={badge.id} sx={{ flexShrink: 0 }}>
          {badge.render(row)}
        </Box>
      ))}
      {actions.length > 0 ? (
        <ActionMenu actions={actions} rowName={rowName} />
      ) : (
        // Keeps the badges of rows with and without actions in one column.
        <Box sx={{ width: 40, flexShrink: 0 }} />
      )}
    </Box>
  );
}
