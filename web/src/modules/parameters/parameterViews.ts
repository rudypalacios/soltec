import type { components } from '@soltec/shared';

/** A value of any catalog parameter; only client statuses carry a color. */
export type ParameterValue = components['schemas']['Segment'] & { color?: string };

/**
 * How each catalog parameter reads on screen. The five share one page and one set of hooks (ADR-0016); what differs is
 * the Spanish wording, which has gender («Nuevo segmento», «Nueva forma de pago»), and whether a value has a color.
 */
export interface ParameterView {
  slug: 'contact-types' | 'client-statuses' | 'segments' | 'tax-regimes' | 'payment-methods';
  /** The permission resource that guards it. */
  resource: string;
  /** The path placeholder of the item routes in the contract. */
  idParam: string;
  /** The tab. */
  label: string;
  /** Plural, lower case, for «No hay … con esos filtros». */
  noun: string;
  newLabel: string;
  editTitle: string;
  /** The error under the name when another active value has it. */
  takenMessage: string;
  hasColor: boolean;
}

export const PARAMETER_VIEWS: readonly ParameterView[] = [
  {
    slug: 'contact-types',
    resource: 'contact_types',
    idParam: 'contactTypeId',
    label: 'Tipos de contacto',
    noun: 'tipos de contacto',
    newLabel: 'Nuevo tipo de contacto',
    editTitle: 'Editar tipo de contacto',
    takenMessage: 'Ya hay un tipo de contacto activo con ese nombre.',
    hasColor: false,
  },
  {
    slug: 'client-statuses',
    resource: 'client_statuses',
    idParam: 'clientStatusId',
    label: 'Estados de cliente',
    noun: 'estados de cliente',
    newLabel: 'Nuevo estado de cliente',
    editTitle: 'Editar estado de cliente',
    takenMessage: 'Ya hay un estado de cliente activo con ese nombre.',
    hasColor: true,
  },
  {
    slug: 'segments',
    resource: 'segments',
    idParam: 'segmentId',
    label: 'Segmentos',
    noun: 'segmentos',
    newLabel: 'Nuevo segmento',
    editTitle: 'Editar segmento',
    takenMessage: 'Ya hay un segmento activo con ese nombre.',
    hasColor: false,
  },
  {
    slug: 'tax-regimes',
    resource: 'tax_regimes',
    idParam: 'taxRegimeId',
    label: 'Regímenes fiscales',
    noun: 'regímenes fiscales',
    newLabel: 'Nuevo régimen fiscal',
    editTitle: 'Editar régimen fiscal',
    takenMessage: 'Ya hay un régimen fiscal activo con ese nombre.',
    hasColor: false,
  },
  {
    slug: 'payment-methods',
    resource: 'payment_methods',
    idParam: 'paymentMethodId',
    label: 'Formas de pago',
    noun: 'formas de pago',
    newLabel: 'Nueva forma de pago',
    editTitle: 'Editar forma de pago',
    takenMessage: 'Ya hay una forma de pago activa con ese nombre.',
    hasColor: false,
  },
];
