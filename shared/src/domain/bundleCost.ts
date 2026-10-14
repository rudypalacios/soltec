/**
 * The cost of a bundle as a live preview while someone edits its components. The server is the source of truth
 * (ADR-0014): it adds up quantity times cost of the components and rounds once, to four decimals, and that is what
 * the lists show. Here the same sum is exact (BigInt over decimal strings) so the preview and the saved value agree.
 */

export interface CostLine {
  /** Greater than zero, up to nine integer digits and three decimals. */
  quantity: string;
  /** Cost of one unit, up to nine integer digits and four decimals. */
  cost: string;
}

const QUANTITY_PATTERN = /^(\d{1,9})(?:\.(\d{1,3}))?$/;
const COST_PATTERN = /^(\d{1,9})(?:\.(\d{1,4}))?$/;
/** Quantity has three decimals and cost four, so their product has seven. */
const PRODUCT_SCALE = 10_000_000n;
const OUTPUT_SCALE = 10_000n;
const ROUNDING = PRODUCT_SCALE / OUTPUT_SCALE;

/** Whether a text is a quantity a bundle accepts: greater than zero, with up to three decimals. */
export function isValidQuantity(quantity: string): boolean {
  const match = QUANTITY_PATTERN.exec(quantity);

  return match !== null && /[1-9]/.test(quantity);
}

function exactProduct(line: CostLine): bigint | null {
  const quantity = QUANTITY_PATTERN.exec(line.quantity);
  const cost = COST_PATTERN.exec(line.cost);
  if (!quantity?.[1] || !cost?.[1] || !isValidQuantity(line.quantity)) {
    return null;
  }

  return (
    BigInt(quantity[1] + (quantity[2] ?? '').padEnd(3, '0')) *
    BigInt(cost[1] + (cost[2] ?? '').padEnd(4, '0'))
  );
}

function format(units: bigint): string {
  const text = units.toString().padStart(5, '0');

  return `${text.slice(0, -4)}.${text.slice(-4)}`;
}

/** Quantity times cost, rounded half up to four decimals; `null` when either is not a valid amount. */
export function lineCostPreview(line: CostLine): string | null {
  const product = exactProduct(line);

  return product === null ? null : format((product + ROUNDING / 2n) / ROUNDING);
}

/**
 * The sum of the exact products rounded once, as the server does; `null` when the list is empty or any line is
 * not valid yet (the preview then says nothing instead of a wrong figure).
 */
export function bundleCostPreview(lines: readonly CostLine[]): string | null {
  if (lines.length === 0) {
    return null;
  }
  let total = 0n;
  for (const line of lines) {
    const product = exactProduct(line);
    if (product === null) {
      return null;
    }
    total += product;
  }

  return format((total + ROUNDING / 2n) / ROUNDING);
}
