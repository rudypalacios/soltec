import type { components } from '@soltec/shared';

type Branding = components['schemas']['Branding'];

const KEY = 'soltec.branding';

/**
 * The last brand this browser saw, kept so the next load can paint the name and start the logo at once instead of
 * waiting for the API. It is a convenience: the browser may refuse or lose it, and the screens work without it.
 */
export function readCachedBranding(): Branding | undefined {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? 'null');
    if (typeof value !== 'object' || value === null) {
      return undefined;
    }
    const { trade_name: name, logo_version: version } = value as Record<string, unknown>;
    return typeof name === 'string' && (typeof version === 'string' || version === null)
      ? { trade_name: name, logo_version: version }
      : undefined;
  } catch {
    // Storage blocked or the content is not JSON: behave as if nothing was saved.
    return undefined;
  }
}

export function writeCachedBranding(branding: Branding): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(branding));
  } catch {
    // Storage full or blocked (a private window): the brand simply is not remembered.
  }
}
