/** A decimal string as people read an amount: at least two decimals, and no more than it has («22.9600» → «22.96»). */
export function formatAmount(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return '—';
  }
  const [whole = '0', decimals = ''] = value.split('.');
  const trimmed = decimals.replace(/0+$/, '').padEnd(2, '0');
  return `${whole}.${trimmed}`;
}
