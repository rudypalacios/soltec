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
 * The symbols of the currencies a company can have. The one of the settings is a code («GTQ»); what people read is the
 * symbol («Q»). It is written here and not asked of `Intl`: `currencyDisplay: 'narrowSymbol'` still printed «GTQ» on a
 * phone, because what a browser knows depends on its locale data. A code without a symbol here shows as the code.
 */
const SYMBOLS: Record<string, string> = { GTQ: 'Q', USD: '$', EUR: '€', MXN: '$' };

/**
 * An amount as money in the currency of the settings («Q 1,920.50»): two decimals, up to four when the cost has them.
 * The digits use the en-US pattern (comma for thousands, point for decimals), which is also Guatemala's, so they come
 * out the same on every device. Display only: the server computes every price.
 */
export function formatMoney(value: string | null | undefined, currencyCode: string): string {
  if (value === null || value === undefined) {
    return '—';
  }
  const digits = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(Number(value));
  return `${SYMBOLS[currencyCode] ?? currencyCode} ${digits}`;
}
