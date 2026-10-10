/**
 * "1234567.8" → "Q 1,234,567.80". The amounts of the API are decimal strings and stay strings: only the grouping
 * of the integer part is added, so no float rounds a price on its way to the screen.
 */
export function formatAmount(amount: string): string {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(amount);
  if (!match?.[1]) {
    return amount;
  }
  const grouped = match[1].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `Q ${grouped}.${(match[2] ?? '').padEnd(2, '0')}`;
}
