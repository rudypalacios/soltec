/**
 * Rates travel as strings with five decimals ("0.12000" is 12 %) so no float touches a tax rate (ADR-0011). These
 * convert to and from the percentage a person types, with string arithmetic only.
 */

/** "0.12000" → "12", "0.125" → "12.5", "0.05000" → "5". Anything that is not a rate below 1 gives null. */
export function rateToPercent(rate: string): string | null {
  const match = /^0\.(\d{1,5})$/.exec(rate);
  if (!match?.[1]) {
    return null;
  }
  const digits = match[1].padEnd(5, '0');
  const whole = String(Number(digits.slice(0, 2)));
  const fraction = digits.slice(2).replace(/0+$/, '');

  return fraction === '' ? whole : `${whole}.${fraction}`;
}

/**
 * "12" → "0.12000", "12.5" → "0.12500". Accepts 0 to 99.999 with up to three decimals and a comma as the decimal
 * mark; anything else gives null.
 */
export function percentToRate(percent: string): string | null {
  const match = /^(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(percent.trim());
  if (!match?.[1]) {
    return null;
  }
  const whole = match[1].padStart(2, '0');
  const fraction = (match[2] ?? '').padEnd(3, '0');

  return `0.${whole}${fraction}`;
}
