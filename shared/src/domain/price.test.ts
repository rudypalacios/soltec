import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calculatePrice, isValidCost, PriceError, type PriceErrorCode } from './price';

interface Vector {
  name: string;
  cost: string;
  vat_rate: string;
  income_tax_rate: string;
  margin_rate: string;
}
interface ValidVector extends Vector {
  without_vat: string;
  with_vat: string;
}
interface InvalidVector extends Vector {
  error: PriceErrorCode;
}

// The same file PHPUnit reads (ADR-0014): the two implementations cannot drift apart unnoticed.
const vectors = JSON.parse(
  readFileSync(new URL('../../../contract/test-vectors/price.json', import.meta.url), 'utf8'),
) as { cases: ValidVector[]; invalid: InvalidVector[] };

const inputOf = (vector: Vector) => ({
  cost: vector.cost,
  vatRate: vector.vat_rate,
  incomeTaxRate: vector.income_tax_rate,
  marginRate: vector.margin_rate,
});

describe('calculatePrice', () => {
  it('has vectors to run', () => {
    expect(vectors.cases.length).toBeGreaterThanOrEqual(3);
    expect(vectors.invalid.length).toBeGreaterThanOrEqual(3);
  });

  it.each(vectors.cases.map((vector) => [vector.name, vector] as const))('%s', (_name, vector) => {
    expect(calculatePrice(inputOf(vector))).toEqual({
      withoutVat: vector.without_vat,
      withVat: vector.with_vat,
    });
  });

  it.each(vectors.invalid.map((vector) => [vector.name, vector] as const))(
    'refuses: %s',
    (_name, vector) => {
      expect(() => calculatePrice(inputOf(vector))).toThrowError(
        expect.objectContaining({ name: 'PriceError', code: vector.error }) as PriceError,
      );
    },
  );
});

describe('isValidCost', () => {
  it.each(['0', '1', '525.01', '999999999.9999', '0.5'])('accepts %j', (cost) => {
    expect(isValidCost(cost)).toBe(true);
  });

  it.each(['', ' 1', '1,5', '-1', '1.', '.5', '1.23456', '1000000000', 'abc'])(
    'refuses %j',
    (cost) => {
      expect(isValidCost(cost)).toBe(false);
    },
  );
});
