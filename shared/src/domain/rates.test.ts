import { describe, expect, it } from 'vitest';
import { percentToRate, rateToPercent } from './rates';

describe('rateToPercent', () => {
  it.each([
    ['0.12000', '12'],
    ['0.03000', '3'],
    ['0.00000', '0'],
    ['0.12500', '12.5'],
    ['0.99999', '99.999'],
    ['0.125', '12.5'],
    ['0.05', '5'],
    ['0.00500', '0.5'],
  ])('%s is %s %%', (rate, percent) => {
    expect(rateToPercent(rate)).toBe(percent);
  });

  it.each(['', '1', '1.00000', '-0.1', '0.123456', 'abc', '.5'])('refuses %j', (rate) => {
    expect(rateToPercent(rate)).toBeNull();
  });
});

describe('percentToRate', () => {
  it.each([
    ['12', '0.12000'],
    ['3', '0.03000'],
    ['0', '0.00000'],
    ['12.5', '0.12500'],
    ['12,5', '0.12500'],
    ['99.999', '0.99999'],
    ['0.5', '0.00500'],
    [' 7 ', '0.07000'],
  ])('%s %% is %s', (percent, rate) => {
    expect(percentToRate(percent)).toBe(rate);
  });

  it.each(['', '100', '-1', '12.3456', '1e1', 'abc', '12%'])('refuses %j', (percent) => {
    expect(percentToRate(percent)).toBeNull();
  });

  it('round-trips every percentage with up to three decimals', () => {
    for (const percent of ['0', '1', '9.5', '12', '12.125', '50', '99.999']) {
      const rate = percentToRate(percent);
      expect(rate && rateToPercent(rate)).toBe(percent);
    }
  });
});
