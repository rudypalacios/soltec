import type { DeviceIdStore } from '@soltec/shared';

const KEY = 'soltec.deviceId';

/**
 * Keeps the device id in localStorage. Storage can be blocked (private windows, site data off): then the id is not
 * remembered and each sign-in simply registers a new device, which is harmless.
 */
export const localDeviceIdStore: DeviceIdStore = {
  read() {
    try {
      return window.localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  write(id) {
    try {
      window.localStorage.setItem(KEY, id);
    } catch {
      // Not remembered: see above.
    }
  },
};
