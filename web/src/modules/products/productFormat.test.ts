import { describe, expect, it } from 'vitest';
import { formatAmount, formatMoney } from './productFormat';

describe('formatMoney', () => {
  it('writes the symbol of the currency, with two decimals and thousands separators', () => {
    expect(formatMoney('9844.38', 'GTQ')).toMatch(/^Q\s?9,844\.38$/);
    expect(formatMoney('22.9600', 'GTQ')).toMatch(/^Q\s?22\.96$/);
  });

  it('never prints the code of the quetzal, and shows a currency without a symbol as its code', () => {
    expect(formatMoney('1', 'GTQ')).not.toContain('GTQ');
    expect(formatMoney('1234.5', 'USD')).toBe('$ 1,234.50');
    expect(formatMoney('1234.5', 'CRC')).toBe('CRC 1,234.50');
  });

  it('keeps up to four decimals when the amount has them, and shows a dash for nothing', () => {
    expect(formatMoney('0.1234', 'GTQ')).toMatch(/^Q\s?0\.1234$/);
    expect(formatMoney(null, 'GTQ')).toBe('—');
    expect(formatMoney(undefined, 'GTQ')).toBe('—');
  });
});

describe('formatAmount', () => {
  it('trims the stored decimals to what people read', () => {
    expect(formatAmount('22.9600')).toBe('22.96');
    expect(formatAmount('1.5')).toBe('1.50');
  });
});
