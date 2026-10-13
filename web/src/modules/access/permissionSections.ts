interface SectionDefinition {
  id: string;
  label: string;
  /** In the order they are shown. */
  resources: readonly string[];
}

/**
 * The sections the permission matrix groups its modules in. How to group them is a presentation choice, so it lives
 * here and not in the API: a module nobody listed lands in «Otros» and is never missing from the matrix.
 */
const SECTIONS: readonly SectionDefinition[] = [
  { id: 'access', label: 'Acceso', resources: ['users', 'roles', 'audit_logs'] },
  { id: 'organization', label: 'Organización', resources: ['departments'] },
  {
    id: 'settings',
    label: 'Configuración',
    resources: ['company', 'financial_settings', 'margin_levels', 'sequences', 'security_settings'],
  },
];

const OTHER = { id: 'other', label: 'Otros' } as const;

export interface ResourceSection<T> {
  id: string;
  label: string;
  items: T[];
}

/** Puts the resources in their sections, dropping the sections that end up empty. */
export function groupBySection<T extends { code: string }>(
  resources: readonly T[],
): ResourceSection<T>[] {
  const byCode = new Map(resources.map((resource) => [resource.code, resource]));
  const placed = new Set<string>();
  const sections = SECTIONS.map((section) => {
    const items = section.resources.flatMap((code) => {
      const resource = byCode.get(code);
      return resource ? [resource] : [];
    });
    items.forEach((resource) => placed.add(resource.code));
    return { id: section.id, label: section.label, items };
  });
  const rest = resources.filter((resource) => !placed.has(resource.code));

  return [...sections, { ...OTHER, items: rest }].filter((section) => section.items.length > 0);
}
