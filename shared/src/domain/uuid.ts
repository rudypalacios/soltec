/** `n` random bytes. The platform's secure generator: the same call exists in browsers, Node and React Native. */
export type RandomBytes = (length: number) => Uint8Array;

const secureRandom: RandomBytes = (length) =>
  globalThis.crypto.getRandomValues(new Uint8Array(length));

/**
 * A time-ordered UUID v7 (ADR-0015), the id a client gives to a record it creates, so retrying the request, or
 * sending it later from an offline phone, never duplicates it. `now` and `random` are parameters for the tests.
 */
export function newUuidV7(now: number = Date.now(), random: RandomBytes = secureRandom): string {
  const bytes = new Uint8Array(16);
  // 48 bits of milliseconds, most significant first. Division and not a shift: a shift works on 32 bits.
  for (let index = 5, rest = Math.floor(now); index >= 0; index -= 1) {
    bytes[index] = rest % 256;
    rest = Math.floor(rest / 256);
  }
  bytes.set(random(10), 6);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
