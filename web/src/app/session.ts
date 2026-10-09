import { AuthSession } from '@soltec/shared';
import { localDeviceIdStore } from '../adapters/localDeviceIdStore';

/**
 * The session of this browser. The API is served from the same origin under /api (ADR-0004); the URL is made
 * absolute because the Request objects the client builds do not resolve relative URLs outside a real page.
 */
export const session = new AuthSession({
  baseUrl: `${window.location.origin}/api`,
  platform: 'web',
  deviceName: 'Navegador web',
  deviceStore: localDeviceIdStore,
});
