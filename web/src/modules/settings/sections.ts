/**
 * The sections of «Configuración». Each shows only to who may view any of its resources; the server enforces it
 * anyway. A section made of several resources («Parámetros») lists them all.
 */
export const SETTINGS_SECTIONS = [
  { label: 'Empresa', path: '/configuracion/empresa', resources: ['company'] },
  { label: 'Finanzas', path: '/configuracion/finanzas', resources: ['financial_settings'] },
  { label: 'Márgenes', path: '/configuracion/margenes', resources: ['margin_levels'] },
  { label: 'Numeración', path: '/configuracion/numeracion', resources: ['sequences'] },
  {
    label: 'Parámetros',
    path: '/configuracion/parametros',
    resources: ['contact_types', 'client_statuses', 'segments', 'tax_regimes', 'payment_methods'],
  },
  { label: 'Seguridad', path: '/configuracion/seguridad', resources: ['security_settings'] },
] as const;
