/**
 * Remembers the id the API gave to this device, so signing in again reuses its record instead of adding one per
 * login. Each platform implements it (localStorage on the web, secure storage on mobile).
 */
export interface DeviceIdStore {
  read(): string | null;
  write(id: string): void;
}
