import type { components } from '@soltec/shared';

type NamedRef = components['schemas']['NamedRef'];

/** A value of any catalog list; only client statuses carry a color, and each list its own parent or count. */
export type ParameterValue = components['schemas']['Segment'] & {
  color?: string;
  area?: NamedRef;
  category?: NamedRef;
  active_group_count?: number;
  active_unit_count?: number;
};

/** The list a value belongs to (a product group's area), as the screens need it. */
export interface ParentSpec {
  /** Field in requests and filters. */
  field: 'area_id' | 'category_id';
  /** Key of the named reference in responses. */
  key: 'area' | 'category';
  /** The parent's own list, to offer its values in the selector. */
  slug: ParameterView['slug'];
  resource: string;
  /** Column header and field label. */
  label: string;
  /** The label of the «all» option of its filter. */
  allLabel: string;
}

/** What blocks deactivating a value: active values of another list under it. */
export interface ChildrenSpec {
  countField: 'active_group_count' | 'active_unit_count';
  /** Error code of the refusal. */
  errorCode: string;
  /** Column header. */
  header: string;
  /** «3 grupos activos». */
  label: (count: number) => string;
  /** What to do about it, after «No se puede desactivar «X»: tiene 3 grupos activos.» */
  hint: string;
}

/**
 * How each catalog list reads on screen. They share one page and one set of hooks (ADR-0016); what differs is
 * the Spanish wording, which has gender («Nuevo segmento», «Nueva forma de pago»), and whether a value has a color.
 */
export interface ParameterView {
  slug:
    | 'contact-types'
    | 'client-statuses'
    | 'segments'
    | 'tax-regimes'
    | 'payment-methods'
    | 'brands'
    | 'areas'
    | 'product-groups'
    | 'unit-categories'
    | 'units-of-measure';
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
  /** Longest name the API accepts. */
  nameMax: number;
  parent?: ParentSpec;
  children?: ChildrenSpec;
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
    nameMax: 100,
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
    nameMax: 100,
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
    nameMax: 100,
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
    nameMax: 100,
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
    nameMax: 100,
  },
];

const plural = (count: number, one: string, many: string) =>
  count === 1 ? `1 ${one}` : `${count} ${many}`;

/** The product structure, in the order of its tabs. */
export const CATALOG_VIEWS: readonly ParameterView[] = [
  {
    slug: 'brands',
    resource: 'brands',
    idParam: 'brandId',
    label: 'Marcas',
    noun: 'marcas',
    newLabel: 'Nueva marca',
    editTitle: 'Editar marca',
    takenMessage: 'Ya hay una marca activa con ese nombre.',
    hasColor: false,
    nameMax: 100,
  },
  {
    slug: 'areas',
    resource: 'areas',
    idParam: 'areaId',
    label: 'Áreas',
    noun: 'áreas',
    newLabel: 'Nueva área',
    editTitle: 'Editar área',
    takenMessage: 'Ya hay un área activa con ese nombre.',
    hasColor: false,
    nameMax: 100,
    children: {
      countField: 'active_group_count',
      errorCode: 'area_in_use',
      header: 'Grupos',
      label: (count) => plural(count, 'grupo activo', 'grupos activos'),
      hint: 'Desactívalos primero.',
    },
  },
  {
    slug: 'product-groups',
    resource: 'product_groups',
    idParam: 'productGroupId',
    label: 'Grupos de producto',
    noun: 'grupos de producto',
    newLabel: 'Nuevo grupo de producto',
    editTitle: 'Editar grupo de producto',
    takenMessage: 'Ya hay un grupo activo con ese nombre en esa área.',
    hasColor: false,
    nameMax: 100,
    parent: {
      field: 'area_id',
      key: 'area',
      slug: 'areas',
      resource: 'areas',
      label: 'Área',
      allLabel: 'Todas',
    },
  },
  {
    slug: 'unit-categories',
    resource: 'unit_categories',
    idParam: 'unitCategoryId',
    label: 'Categorías de unidad',
    noun: 'categorías de unidad',
    newLabel: 'Nueva categoría de unidad',
    editTitle: 'Editar categoría de unidad',
    takenMessage: 'Ya hay una categoría activa con ese nombre.',
    hasColor: false,
    nameMax: 60,
    children: {
      countField: 'active_unit_count',
      errorCode: 'unit_category_in_use',
      header: 'Unidades',
      label: (count) => plural(count, 'unidad activa', 'unidades activas'),
      hint: 'Desactívalas primero.',
    },
  },
  {
    slug: 'units-of-measure',
    resource: 'units_of_measure',
    idParam: 'unitOfMeasureId',
    label: 'Unidades de medida',
    noun: 'unidades de medida',
    newLabel: 'Nueva unidad de medida',
    editTitle: 'Editar unidad de medida',
    takenMessage: 'Ya hay una unidad activa con ese nombre.',
    hasColor: false,
    nameMax: 60,
    parent: {
      field: 'category_id',
      key: 'category',
      slug: 'unit-categories',
      resource: 'unit_categories',
      label: 'Categoría',
      allLabel: 'Todas',
    },
  },
];

/** Every list, to find the one a view's parent points at. */
export const ALL_VIEWS: readonly ParameterView[] = [...PARAMETER_VIEWS, ...CATALOG_VIEWS];

/** The view of a list, for a screen that works with one of them outside the catalog pages. */
export function viewOf(slug: ParameterView['slug']): ParameterView {
  const view = ALL_VIEWS.find((candidate) => candidate.slug === slug);
  if (!view) {
    throw new Error(`Unknown catalog list "${slug}".`);
  }
  return view;
}
