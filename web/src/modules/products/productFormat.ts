/** A decimal string as people read an amount: at least two decimals, and no more than it has («22.9600» → «22.96»). */
export function formatAmount(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return '—';
  }
  const [whole = '0', decimals = ''] = value.split('.');
  const trimmed = decimals.replace(/0+$/, '').padEnd(2, '0');
  return `${whole}.${trimmed}`;
}

/**
 * An amount as money in the currency of the settings («Q 1.92»): two decimals, up to four when the cost has them.
 * Display only: the server computes every price.
 */
export function formatMoney(value: string | null | undefined, currencyCode: string): string {
  if (value === null || value === undefined) {
    return '—';
  }
  return new Intl.NumberFormat('es-GT', {
    style: 'currency',
    currency: currencyCode,
    // The symbol («Q»), not the code («GTQ»): the code is what phones without the es-GT data fall back to, and it is
    // wider than the columns of the lists were drawn for.
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(Number(value));
}
