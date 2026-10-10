/**
 * The catalog price function (ADR-0011), repeated here only for a live preview while someone types. The server is the
 * source of truth (ADR-0014): when the two differ, the server wins. Both run against `contract/test-vectors/price.json`.
 *
 *   without_vat = ((cost / (1 + VAT)) / (1 − MC)) / (1 − ISR)
 *   with_vat    = without_vat × (1 + VAT)
 *
 * It is exact: amounts and rates are decimal strings turned into BigInt and the result is rounded half up to cents
 * once, at the end. The VAT cancels in `with_vat = cost / ((1 − MC) × (1 − ISR))`.
 */

export type PriceErrorCode = 'invalid_cost' | 'invalid_rate' | 'price_too_large';

export class PriceError extends Error {
  constructor(readonly code: PriceErrorCode) {
    super(code);
    this.name = 'PriceError';
  }
}

export interface PriceInput {
  /** Decimal with up to four decimals, as on the supplier's invoice (VAT included). */
  cost: string;
  vatRate: string;
  incomeTaxRate: string;
  marginRate: string;
}

export interface Price {
  withoutVat: string;
  withVat: string;
}

const COST_PATTERN = /^(\d{1,9})(?:\.(\d{1,4}))?$/;
const RATE_PATTERN = /^0(?:\.(\d{1,5}))?$/;
const RATE_UNIT = 100_000n;
/** Same limit as the server: a price of 10^13 or more is a typo. */
const MAX_CENTS = 999_999_999_999_999n;

/** Whether a text is a cost the price function accepts: up to nine integer digits and four decimals. */
export function isValidCost(cost: string): boolean {
  return COST_PATTERN.test(cost);
}

function costUnits(cost: string): bigint {
  const match = COST_PATTERN.exec(cost);
  if (!match?.[1]) {
    throw new PriceError('invalid_cost');
  }

  return BigInt(match[1] + (match[2] ?? '').padEnd(4, '0'));
}

function rateUnits(rate: string): bigint {
  const match = RATE_PATTERN.exec(rate);
  if (!match) {
    throw new PriceError('invalid_rate');
  }

  return BigInt((match[1] ?? '').padEnd(5, '0'));
}

/** round_half_up(numerator × 10^zeros / divisor). */
function divideRounded(numerator: bigint, zeros: number, divisor: bigint): bigint {
  const scaled = numerator * 10n ** BigInt(zeros);
  const quotient = scaled / divisor;
  const rounded = (scaled % divisor) * 2n >= divisor ? quotient + 1n : quotient;
  if (rounded > MAX_CENTS) {
    throw new PriceError('price_too_large');
  }

  return rounded;
}

function formatCents(cents: bigint): string {
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

/** @throws PriceError when an input is not a valid cost or rate, or the price is beyond the supported range. */
export function calculatePrice(input: PriceInput): Price {
  const cost = costUnits(input.cost);
  const vat = rateUnits(input.vatRate);
  const incomeTax = rateUnits(input.incomeTaxRate);
  const margin = rateUnits(input.marginRate);

  const withVatDivisor = (RATE_UNIT - margin) * (RATE_UNIT - incomeTax);
  const withoutVatDivisor = (RATE_UNIT + vat) * withVatDivisor;

  // The cost is in 10^-4 and each factor in 10^-5, so the exponents bring the quotient to cents.
  return {
    withoutVat: formatCents(divideRounded(cost, 13, withoutVatDivisor)),
    withVat: formatCents(divideRounded(cost, 8, withVatDivisor)),
  };
}
