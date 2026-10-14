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

function QuantityField({
  line,
  readOnly,
  error,
  onChange,
}: {
  line: Line;
  readOnly: boolean;
  error: string | undefined;
  onChange: (quantity: string) => void;
}) {
  return (
    <TextField
      hiddenLabel
      size="small"
      value={line.quantity}
      onChange={(event) => onChange(event.target.value)}
      error={Boolean(error)}
      helperText={error}
      slotProps={{
        htmlInput: {
          'aria-label': `Cantidad de ${line.name}`,
          inputMode: 'decimal',
          maxLength: 13,
          readOnly,
          sx: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
        },
        input: {
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
      sx={{ width: { xs: 150, md: 160 } }}
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
              Costo del paquete
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
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <CodeChip code={line.code} />
              <Typography
                sx={{ fontWeight: 600, flexGrow: 1, minWidth: 0, overflowWrap: 'anywhere' }}
              >
                {line.name}
              </Typography>
              {readOnly ? null : (
                <RemoveButton line={line} onRemove={() => onRemove(line.productId)} />
              )}
            </Stack>
            <Stack
              direction="row"
              spacing={1.5}
              sx={{ alignItems: 'flex-start', flexWrap: 'wrap', mt: 0.5 }}
            >
              <QuantityField
                line={line}
                readOnly={readOnly}
                error={errorAt(position)}
                onChange={(quantity) => onQuantity(line.productId, quantity)}
              />
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ pt: 1, fontVariantNumeric: 'tabular-nums' }}
              >
                × {money(line.cost)}
              </Typography>
              <Typography
                sx={{ pt: 0.75, ml: 'auto', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
              >
                {money(lineCostPreview({ quantity: line.quantity, cost: line.cost }))}
              </Typography>
            </Stack>
            {line.isActive && !line.costIsStale ? null : (
              <Stack direction="row" spacing={1.5} sx={{ mt: 0.5 }}>
                {line.isActive ? null : <InactiveTag />}
                {line.costIsStale ? (
                  <StatusBadge tone="warning" label="Costo desactualizado" />
                ) : null}
              </Stack>
            )}
          </Box>
        ))}
      </Box>
      <Stack
        direction="row"
        sx={{ justifyContent: 'space-between', alignItems: 'baseline', pt: 1.5 }}
      >
        <Typography sx={{ fontWeight: 600 }}>Costo del paquete</Typography>
        <Typography sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {money(total)}
        </Typography>
      </Stack>
    </Box>
  );
}
