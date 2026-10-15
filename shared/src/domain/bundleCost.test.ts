import { describe, expect, it } from 'vitest';
import { bundleCostPreview, isValidQuantity, lineCostPreview } from './bundleCost';

describe('lineCostPreview', () => {
  it('multiplies quantity by cost and rounds half up to four decimals', () => {
    expect(lineCostPreview({ quantity: '18', cost: '22.9600' })).toBe('413.2800');
    expect(lineCostPreview({ quantity: '4.5', cost: '1.5' })).toBe('6.7500');
    // 0.001 × 0.0005 = 0.0000005, far below half of the fourth decimal.
    expect(lineCostPreview({ quantity: '0.001', cost: '0.0005' })).toBe('0.0000');
    expect(lineCostPreview({ quantity: '0.333', cost: '1.0005' })).toBe('0.3332');
  });

  it('says nothing for an amount that is not valid', () => {
    expect(lineCostPreview({ quantity: '', cost: '1' })).toBeNull();
    expect(lineCostPreview({ quantity: '0', cost: '1' })).toBeNull();
    expect(lineCostPreview({ quantity: '1.2345', cost: '1' })).toBeNull();
    expect(lineCostPreview({ quantity: '1', cost: 'x' })).toBeNull();
  });
});

describe('bundleCostPreview', () => {
  it('adds the exact products and rounds once, so it can differ from the lines by a rounding', () => {
    const lines = [
      { quantity: '0.333', cost: '1.0005' },
      { quantity: '0.333', cost: '1.0005' },
    ];
    expect(lineCostPreview({ quantity: '0.333', cost: '1.0005' })).toBe('0.3332');
    // 2 × 0.3331665 = 0.666333 → 0.6663, not 0.3332 + 0.3332.
    expect(bundleCostPreview(lines)).toBe('0.6663');
  });

  it('is null with no lines or with a line that is not valid yet', () => {
    expect(bundleCostPreview([])).toBeNull();
    expect(
      bundleCostPreview([
        { quantity: '1', cost: '2' },
        { quantity: '', cost: '2' },
      ]),
    ).toBeNull();
  });
});

describe('isValidQuantity', () => {
  it('accepts greater than zero with up to three decimals', () => {
    expect(isValidQuantity('18')).toBe(true);
    expect(isValidQuantity('0.001')).toBe(true);
    expect(isValidQuantity('0')).toBe(false);
    expect(isValidQuantity('0.000')).toBe(false);
    expect(isValidQuantity('1.2345')).toBe(false);
    expect(isValidQuantity('-1')).toBe(false);
  });
});
