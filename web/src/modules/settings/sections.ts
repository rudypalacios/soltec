/** The sections of «Configuración». Each shows only to who may view it; the server enforces it anyway. */
export const SETTINGS_SECTIONS = [
  { label: 'Empresa', path: '/configuracion/empresa', resource: 'company' },
  { label: 'Finanzas', path: '/configuracion/finanzas', resource: 'financial_settings' },
  { label: 'Márgenes', path: '/configuracion/margenes', resource: 'margin_levels' },
  { label: 'Numeración', path: '/configuracion/numeracion', resource: 'sequences' },
  { label: 'Seguridad', path: '/configuracion/seguridad', resource: 'security_settings' },
] as const;
