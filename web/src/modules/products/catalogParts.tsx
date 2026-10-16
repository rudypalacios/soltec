import { Box, Typography } from '@mui/material';
import { color } from '../../theme/tokens';
import { formatMoney } from './productFormat';

/** The same signals for a record whose cost is stale, in amber. An inactive record shows the red ones instead. */
export const STALE_ROW = {
  bgcolor: color.stale.wash,
  '& > td:first-of-type': { boxShadow: `inset 3px 0 0 ${color.stale.stripe}` },
  '&.MuiTableRow-hover:hover': { bgcolor: color.stale.wash },
} as const;

/** The stripe and the wash alone, for a row that is not a table row (the compact list of a phone). */
export const STALE_MARK = {
  bgcolor: color.stale.wash,
  boxShadow: `inset 3px 0 0 ${color.stale.stripe}`,
} as const;

export function StaleTag() {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-block',
        bgcolor: color.warning.tint,
        color: color.warning.main,
        fontSize: '0.75rem',
        fontWeight: 600,
        borderRadius: 999,
        px: 1,
        whiteSpace: 'nowrap',
      }}
    >
      Costo desactualizado
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
