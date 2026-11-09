import { describe, expect, it } from 'vitest';
import { newUuidV7 } from './uuid';

const zeros = (length: number) => new Uint8Array(length);
const ones = (length: number) => new Uint8Array(length).fill(0xff);

describe('newUuidV7', () => {
  it('writes the milliseconds in the first 48 bits and the version and variant in their place', () => {
    // 0x0192f1c27d3a milliseconds, all random bits at zero.
    expect(newUuidV7(0x0192f1c27d3a, zeros)).toBe('0192f1c2-7d3a-7000-8000-000000000000');
    expect(newUuidV7(0x0192f1c27d3a, ones)).toBe('0192f1c2-7d3a-7fff-bfff-ffffffffffff');
  });

  it('sorts by time, so inserting the newest id lands at the end of an index', () => {
    const earlier = newUuidV7(1_800_000_000_000, ones);
    const later = newUuidV7(1_800_000_000_001, zeros);

    expect(earlier < later).toBe(true);
  });

  it('makes a valid id from the platform generator, different each time', () => {
    const first = newUuidV7();
    const second = newUuidV7();

    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(second).not.toBe(first);
  });
});
