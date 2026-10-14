import DeleteOutline from '@mui/icons-material/DeleteOutline';
import {
  Box,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { lineCostPreview } from '@soltec/shared';
import type { ReactNode } from 'react';
import { StatusBadge } from '../../components/StatusBadge';
import { useIsMobile } from '../../components/useIsMobile';
import { INACTIVE_ROW, InactiveTag } from './catalogParts';
import { CodeChip } from './CodeChip';
import { formatMoney } from './productFormat';

/** A component as the form keeps it: what the person edits (the quantity) and what it shows of the product. */
export interface Line {
  productId: string;
  code: string;
  name: string;
  unit: string;
  /** The cost of one unit, VAT included, four decimals. */
  cost: string;
  quantity: string;
  /** False for a product deactivated after it went into the bundle. */
  isActive: boolean;
  costIsStale: boolean;
}

/** Text for screen readers only (the recipe `DataList` uses); its cell must be `position: relative` to anchor it. */
const HIDDEN = {
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

interface Props {
  lines: Line[];
  currencyCode: string;
  readOnly: boolean;
  /** The total shown under the lines: a preview while editing, the server's figure when only reading. */
  total: string | null;
  /** What the total is called; the form adds the mark of its footnote. */
  totalLabel?: ReactNode;
  /** The message under the quantity of the line at this position, if any. */
  errorAt: (position: number) => string | undefined;
  onQuantity: (productId: string, quantity: string) => void;
  onRemove: (productId: string) => void;
}

/**
 * The components of a bundle as a table on a desktop and as a compact list (two lines and a divider each, no cards)
 * on a phone, as the lists of the app do. The quantity is edited in the row, with the unit of its product beside it.
 */
export function ComponentsTable(props: Props) {
  const isMobile = useIsMobile();
  return isMobile ? <CompactList {...props} /> : <DesktopTable {...props} />;
}

/** The width of the quantity box on a phone: room for a large quantity with decimals (about eleven characters). */
const QUANTITY_WIDTH = 120;

/**
 * The quantity of a component. In the table the unit of its product sits inside the box; on a phone the box has a fixed
 * width and only the number, because a unit can be as long as «Metro cuadrado» and would not fit (the compact list says
 * the unit in the line of the cost instead).
 */
function QuantityField({
  line,
  readOnly,
  error,
  onChange,
  compact = false,
}: {
  line: Line;
  readOnly: boolean;
  error: string | undefined;
  onChange: (quantity: string) => void;
  compact?: boolean;
}) {
  return (
    <TextField
      hiddenLabel
      size="small"
      value={line.quantity}
      onChange={(event) => onChange(event.target.value)}
      error={Boolean(error)}
      // On a phone the box is narrow: its message goes under the whole row instead (see CompactList).
      helperText={compact ? undefined : error}
      slotProps={{
        htmlInput: {
          'aria-label': `Cantidad de ${line.name}`,
          inputMode: 'decimal',
          maxLength: 13,
          readOnly,
          sx: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
        },
        input: compact
          ? undefined
          : {
              endAdornment: (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ ml: 0.5, whiteSpace: 'nowrap' }}
                >
                  {line.unit}
                </Typography>
              ),
            },
      }}
      sx={{ width: compact ? QUANTITY_WIDTH : 180, flexShrink: 0 }}
    />
  );
}

function RemoveButton({ line, onRemove }: { line: Line; onRemove: () => void }) {
  return (
    <IconButton
      aria-label={`Quitar ${line.name}`}
      onClick={onRemove}
      sx={{ width: 44, height: 44 }}
    >
      <DeleteOutline />
    </IconButton>
  );
}

function Stale({ line }: { line: Line }) {
  return line.costIsStale ? <StatusBadge tone="warning" label="Desactualizado" /> : null;
}

function DesktopTable({
  lines,
  currencyCode,
  readOnly,
  total,
  totalLabel = 'Costo del paquete',
  errorAt,
  onQuantity,
  onRemove,
}: Props) {
  const money = (value: string | null) => formatMoney(value, currencyCode);
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" aria-label="Componentes del paquete">
        <TableHead>
          <TableRow>
            <TableCell>Código</TableCell>
            <TableCell sx={{ minWidth: 220 }}>Componente</TableCell>
            <TableCell align="right">Cantidad</TableCell>
            <TableCell align="right">Costo unitario</TableCell>
            <TableCell align="right">Subtotal</TableCell>
            {readOnly ? null : (
              <TableCell align="right" sx={{ position: 'relative' }}>
                <Box component="span" sx={HIDDEN}>
                  Quitar
                </Box>
              </TableCell>
            )}
          </TableRow>
        </TableHead>
        <TableBody>
          {lines.map((line, position) => (
            <TableRow key={line.productId} sx={line.isActive ? undefined : INACTIVE_ROW}>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                <CodeChip code={line.code} />
              </TableCell>
              <TableCell>
                <Typography component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>
                  {line.name}
                </Typography>{' '}
                {line.isActive ? null : <InactiveTag />}
              </TableCell>
              <TableCell align="right" sx={{ verticalAlign: 'top' }}>
                <QuantityField
                  line={line}
                  readOnly={readOnly}
                  error={errorAt(position)}
                  onChange={(quantity) => onQuantity(line.productId, quantity)}
                />
              </TableCell>
              <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                <Stack spacing={0.25} sx={{ alignItems: 'flex-end' }}>
                  <span>{money(line.cost)}</span>
                  <Stale line={line} />
                </Stack>
              </TableCell>
              <TableCell
                align="right"
                sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
              >
                {money(lineCostPreview({ quantity: line.quantity, cost: line.cost }))}
              </TableCell>
              {readOnly ? null : (
                <TableCell align="right" sx={{ width: 56 }}>
                  <RemoveButton line={line} onRemove={() => onRemove(line.productId)} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow sx={{ bgcolor: 'action.hover' }}>
            <TableCell colSpan={4} sx={{ fontWeight: 600 }}>
              {totalLabel}
            </TableCell>
            <TableCell
              align="right"
              sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
            >
              {money(total)}
            </TableCell>
            {readOnly ? null : <TableCell />}
          </TableRow>
        </TableFooter>
      </Table>
    </TableContainer>
  );
}

function CompactList({
  lines,
  currencyCode,
  readOnly,
  total,
  totalLabel = 'Costo del paquete',
  errorAt,
  onQuantity,
  onRemove,
}: Props) {
  const money = (value: string | null) => formatMoney(value, currencyCode);
  return (
    <Box>
      <Box
        component="ul"
        aria-label="Componentes del paquete"
        sx={{ listStyle: 'none', m: 0, p: 0, borderTop: 1, borderColor: 'divider' }}
      >
        {lines.map((line, position) => (
          <Box
            component="li"
            key={line.productId}
            sx={{
              // The wash of an inactive line reaches the edge of the form; the content keeps its margin.
              mx: -2,
              px: 2,
              py: 1.25,
              borderBottom: 1,
              borderColor: 'divider',
              ...(line.isActive
                ? {}
                : {
                    bgcolor: INACTIVE_ROW.bgcolor,
                    boxShadow: INACTIVE_ROW['& > td:first-of-type'].boxShadow,
                  }),
            }}
          >
            {/*
              The name takes the whole width and sets the height of its row: one line, one line; five lines, five. The
              button of 44 px is taken out of the flow (absolute, centred on the first line) so it never stretches a
              short row; the name leaves room for it on the right.
            */}
            <Box sx={{ position: 'relative', pr: readOnly ? 0 : 4.5 }}>
              <Typography sx={{ fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>
                {line.name}
              </Typography>
              {readOnly ? null : (
                <Box sx={{ position: 'absolute', top: -10, right: -10 }}>
                  <RemoveButton line={line} onRemove={() => onRemove(line.productId)} />
                </Box>
              )}
            </Box>
            <Stack
              direction="row"
              sx={{ alignItems: 'center', flexWrap: 'wrap', gap: '6px 12px', mt: 0.75 }}
            >
              <CodeChip code={line.code} />
              {line.isActive ? null : <InactiveTag />}
              {line.costIsStale ? (
                <StatusBadge tone="warning" label="Costo desactualizado" />
              ) : null}
            </Stack>
            {/* The box on the left, alone; the cost of a unit over the subtotal on the right, both against the edge. */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: `${QUANTITY_WIDTH}px minmax(0, 1fr)`,
                columnGap: 1.5,
                alignItems: 'start',
                mt: 1.25,
              }}
            >
              <QuantityField
                compact
                line={line}
                readOnly={readOnly}
                error={errorAt(position)}
                onChange={(quantity) => onQuantity(line.productId, quantity)}
              />
              <Stack
                spacing={0.25}
                sx={{ minHeight: 48, justifyContent: 'center', textAlign: 'right', minWidth: 0 }}
              >
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  × {money(line.cost)} por {line.unit.toLowerCase()}
                </Typography>
                <Typography sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {money(lineCostPreview({ quantity: line.quantity, cost: line.cost }))}
                </Typography>
              </Stack>
            </Box>
            {errorAt(position) ? (
              <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
                {errorAt(position)}
              </Typography>
            ) : null}
          </Box>
        ))}
      </Box>
      <Stack
        direction="row"
        sx={{ justifyContent: 'space-between', alignItems: 'baseline', pt: 1.5 }}
      >
        <Typography sx={{ fontWeight: 600 }}>{totalLabel}</Typography>
        <Typography sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {money(total)}
        </Typography>
      </Stack>
    </Box>
  );
}
