import { describe, expect, it } from 'vitest';
import { formatAmount } from './formatAmount';

describe('formatAmount', () => {
  it.each([
    ['0.00', 'Q 0.00'],
    ['807.83', 'Q 807.83'],
    ['1234567.8', 'Q 1,234,567.80'],
    ['100000.00', 'Q 100,000.00'],
    ['1538698261.27', 'Q 1,538,698,261.27'],
    ['12', 'Q 12.00'],
  ])('%s is %s', (amount, text) => {
    expect(formatAmount(amount)).toBe(text);
  });

  it('leaves what is not an amount as it came', () => {
    expect(formatAmount('abc')).toBe('abc');
  });
});
