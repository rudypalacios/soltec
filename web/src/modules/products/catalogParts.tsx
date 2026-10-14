import { Box, Typography } from '@mui/material';
import { color } from '../../theme/tokens';
import { formatMoney } from './productFormat';

/**
 * How an inactive record shows in a catalog list, with three quiet signals so «Todos» still tells them apart: a stripe
 * at the left, a faint wash and grey text (the name keeps its colour), plus the «Inactivo» tag. Amber stays for the
 * stale cost, so the two never read as the same thing. Products and bundles share it.
 */
export const INACTIVE_ROW = {
  bgcolor: color.inactive.wash,
  '& > td': { color: 'text.secondary' },
  '& > td:first-of-type': { boxShadow: `inset 3px 0 0 ${color.inactive.stripe}` },
  '&.MuiTableRow-hover:hover': { bgcolor: color.inactive.wash },
} as const;

/** The same signals on the card of a phone. */
export const INACTIVE_CARD = {
  bgcolor: color.inactive.wash,
  borderLeft: `3px solid ${color.inactive.stripe}`,
} as const;

export function InactiveTag() {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-block',
        bgcolor: color.error.tint,
        color: color.error.main,
        fontSize: '0.75rem',
        fontWeight: 600,
        borderRadius: 999,
        px: 1,
        whiteSpace: 'nowrap',
      }}
    >
      Inactivo
    </Box>
  );
}

/** The derived price with and without VAT, as the lists show it. The server computes both. */
export function PriceBlock({
  priceWithVat,
  priceWithoutVat,
  currencyCode,
}: {
  priceWithVat: string | null | undefined;
  priceWithoutVat: string | null | undefined;
  currencyCode: string;
}) {
  return (
    <Box sx={{ textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
      <Typography component="div" sx={{ fontWeight: 600 }}>
        {formatMoney(priceWithVat, currencyCode)}
      </Typography>
      <Typography component="div" variant="body2" color="text.secondary">
        {formatMoney(priceWithoutVat, currencyCode)} sin IVA
      </Typography>
    </Box>
  );
}

/** What a bulk action did, in a sentence: «Se desactivaron 3 productos. 1 ya estaba así.» */
export function bulkSummary(
  verb: string,
  result: { affected: number; unchanged: number; blocked: number },
  what: { one: string; many: string; blockedBy: string } = {
    one: 'producto',
    many: 'productos',
    blockedBy: 'su proveedor',
  },
): string {
  const plural = (count: number) => (count === 1 ? `1 ${what.one}` : `${count} ${what.many}`);
  const parts = [`Se ${verb} ${plural(result.affected)}.`];
  if (result.unchanged > 0) {
    parts.push(
      `${plural(result.unchanged)} ya estaba${result.unchanged === 1 ? '' : 'n'} así o no aplicaba.`,
    );
  }
  if (result.blocked > 0) {
    parts.push(
      `${plural(result.blocked)} no se pudo${result.blocked === 1 ? '' : 'ieron'} reactivar porque ${what.blockedBy} está desactivado.`,
    );
  }
  return parts.join(' ');
}
