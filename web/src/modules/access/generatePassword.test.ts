import { describe, expect, it } from 'vitest';
import { generatePassword } from './generatePassword';

describe('generatePassword', () => {
  it('makes 16 characters by default and honours another length', () => {
    expect(generatePassword()).toHaveLength(16);
    expect(generatePassword(24)).toHaveLength(24);
  });

  it('uses only letters and digits that cannot be confused', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generatePassword()).toMatch(/^[a-km-zA-HJ-NP-Z2-9]+$/);
    }
  });

  it('does not repeat itself', () => {
    const passwords = new Set(Array.from({ length: 100 }, () => generatePassword()));
    expect(passwords.size).toBe(100);
  });
});
