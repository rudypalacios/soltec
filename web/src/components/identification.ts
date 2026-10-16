import type { components } from '@soltec/shared';

export type IdentificationType = components['schemas']['IdentificationType'];

/** How each identification type reads on screen. The server validates the number; the web only shows its error. */
export const IDENTIFICATION_LABELS: Record<IdentificationType, string> = {
  nit: 'NIT',
  cui: 'CUI',
  none: 'Sin identificación',
};

/** What a list shows in the identification column: «NIT 6647912-6», or a dash for none. */
export function identificationText(record: {
  identification_type: IdentificationType;
  identification: string | null;
}) {
  return record.identification
    ? `${IDENTIFICATION_LABELS[record.identification_type]} ${record.identification}`
    : '—';
}
