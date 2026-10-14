import type { components } from '@soltec/shared';

export type IdentificationType = components['schemas']['IdentificationType'];

/** How each identification type reads on screen. The server validates the number; the web only shows its error. */
export const IDENTIFICATION_LABELS: Record<IdentificationType, string> = {
  nit: 'NIT',
  cui: 'CUI',
  none: 'Sin identificación',
};
