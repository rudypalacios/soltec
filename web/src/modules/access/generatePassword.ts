// Letters and digits that cannot be mistaken for each other when read aloud or copied by hand.
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * A random temporary password for a new account, 16 characters (the policy asks for 12 to 72). It uses the browser's
 * cryptographic generator and discards values that would bias the choice of characters.
 */
export function generatePassword(length = 16): string {
  const limit = 256 - (256 % ALPHABET.length);
  let password = '';
  while (password.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length))) {
      if (byte < limit && password.length < length) {
        password += ALPHABET[byte % ALPHABET.length];
      }
    }
  }
  return password;
}
