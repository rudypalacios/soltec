import { describe, expect, it } from 'vitest';
import { formatUntil } from './formatting';

describe('formatUntil', () => {
  const now = new Date(2026, 9, 10, 12, 0);

  it('gives only the time when it ends today', () => {
    const iso = new Date(2026, 9, 10, 22, 8).toISOString();
    expect(formatUntil(iso, now)).toMatch(/10:08/);
    expect(formatUntil(iso, now)).not.toMatch(/2026/);
  });

  it('gives the date too when it ends another day', () => {
    const iso = new Date(2026, 9, 11, 9, 5).toISOString();
    expect(formatUntil(iso, now)).toMatch(/2026/);
  });
});
