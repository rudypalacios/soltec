import { CATALOG_VIEWS, PARAMETER_VIEWS } from '../modules/parameters/parameterViews';
import { SETTINGS_SECTIONS } from '../modules/settings/sections';

/** Whether the signed-in person may do something with a resource. */
export type Can = (resource: string, action: string) => boolean;

export type NavGroupId = 'work' | 'commercial' | 'catalog' | 'admin';

/** The groups of the menu, in the order they are drawn. */
export const NAV_GROUPS: readonly { id: NavGroupId; label: string }[] = [
  { id: 'work', label: 'Trabajo' },
  { id: 'commercial', label: 'Comercial' },
  { id: 'catalog', label: 'Catálogo' },
  { id: 'admin', label: 'Administración' },
];

export type NavId =
  | 'home'
  | 'tasks'
  | 'clients'
  | 'contacts'
  | 'products'
  | 'suppliers'
  | 'catalog'
  | 'users'
  | 'roles'
  | 'departments'
  | 'audit'
  | 'settings';

export interface NavEntry {
  id: NavId;
  label: string;
  path: string;
  /** The group it sits in; null for a screen that belongs to none (Inicio). */
  group: NavGroupId | null;
  /** Without permissions the entry is for every signed-in user; with several, any one of them is enough. */
  permissions?: { resource: string; action: string }[];
  /** For an entry that opens one of several screens: the address to use for whoever may view this one first. */
  fallbacks?: { path: string; resource: string }[];
  /** Other addresses that keep the entry highlighted (the tabs of the same section). */
  alsoActiveOn?: string[];
}

/** The screens of the menu. Each shows only to whoever may open it; the server enforces it anyway. */
export const NAV_ENTRIES: readonly NavEntry[] = [
  { id: 'home', label: 'Inicio', path: '/', group: null },
  // For every internal user: whoever asked for a task, was asked to do it or was mentioned in it sees it.
  { id: 'tasks', label: 'Tareas', path: '/tareas', group: 'work' },
  {
    id: 'clients',
    label: 'Clientes',
    path: '/clientes',
    group: 'commercial',
    permissions: [{ resource: 'clients', action: 'view' }],
  },
  {
    id: 'contacts',
    label: 'Contactos',
    path: '/contactos',
    group: 'commercial',
    permissions: [{ resource: 'contacts', action: 'view' }],
  },
  {
    id: 'products',
    label: 'Productos',
    path: '/productos',
    group: 'catalog',
    // Products and bundles are tabs of one section: the entry opens the first one the person may view.
    permissions: [
      { resource: 'products', action: 'view' },
      { resource: 'bundles', action: 'view' },
    ],
    fallbacks: [{ path: '/paquetes', resource: 'bundles' }],
    alsoActiveOn: ['/paquetes'],
  },
  {
    id: 'suppliers',
    label: 'Proveedores',
    path: '/proveedores',
    group: 'catalog',
    permissions: [{ resource: 'suppliers', action: 'view' }],
  },
  {
    // «Parámetros» alone would repeat the section of Configuración that is called that.
    id: 'catalog',
    label: 'Parámetros del catálogo',
    path: '/catalogo',
    group: 'catalog',
    permissions: CATALOG_VIEWS.map((view) => ({ resource: view.resource, action: 'view' })),
  },
  {
    id: 'users',
    label: 'Usuarios',
    path: '/usuarios',
    group: 'admin',
    permissions: [{ resource: 'users', action: 'view' }],
  },
  {
    id: 'roles',
    label: 'Perfiles',
    path: '/perfiles',
    group: 'admin',
    permissions: [{ resource: 'roles', action: 'view' }],
  },
  {
    id: 'departments',
    label: 'Departamentos',
    path: '/departamentos',
    group: 'admin',
    permissions: [{ resource: 'departments', action: 'view' }],
  },
  {
    id: 'audit',
    label: 'Auditoría',
    path: '/auditoria',
    group: 'admin',
    permissions: [{ resource: 'audit_logs', action: 'view' }],
  },
  {
    id: 'settings',
    label: 'Configuración',
    path: '/configuracion',
    group: 'admin',
    permissions: SETTINGS_SECTIONS.flatMap((section) =>
      section.resources.map((resource) => ({ resource, action: 'view' })),
    ),
  },
];

const mayOpen = (entry: NavEntry, can: Can): boolean =>
  !entry.permissions || entry.permissions.some((p) => can(p.resource, p.action));

/** The entries the person may open, in the order of the menu. */
export function visibleEntries(can: Can): NavEntry[] {
  return NAV_ENTRIES.filter((entry) => mayOpen(entry, can));
}

/** The groups that keep at least one visible entry, each with its entries. A group with none is not drawn. */
export function visibleGroups(
  can: Can,
): { group: (typeof NAV_GROUPS)[number]; entries: NavEntry[] }[] {
  const visible = visibleEntries(can);
  return NAV_GROUPS.map((group) => ({
    group,
    entries: visible.filter((entry) => entry.group === group.id),
  })).filter(({ entries }) => entries.length > 0);
}

/** Where an entry leads: its own address, or the first alternative the person may open when they cannot view it. */
export function targetOf(entry: NavEntry, can: Can): string {
  const own = entry.permissions?.[0];
  if (!own || can(own.resource, own.action)) {
    return entry.path;
  }
  return entry.fallbacks?.find((fallback) => can(fallback.resource, 'view'))?.path ?? entry.path;
}

const within = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

/** The entry the current address belongs to (its own address, a section under it, or one of its alternatives). */
export function activeEntry(entries: readonly NavEntry[], pathname: string): NavEntry | undefined {
  const matches = entries.filter((entry) =>
    entry.path === '/'
      ? pathname === '/'
      : [entry.path, ...(entry.alsoActiveOn ?? [])].some((prefix) => within(pathname, prefix)),
  );
  // The longest address wins, so a section nested under another entry is not taken for it.
  return matches.sort((a, b) => b.path.length - a.path.length)[0];
}

/** What the search offers: a screen of the menu, or a section inside one of them. */
export interface SearchTarget {
  /** Stable key for the list. */
  key: string;
  /** What it is called in the results; a section reads «Configuración › Finanzas». */
  label: string;
  /** Address, with its query when the section is a tab of its screen. */
  path: string;
  groupId: NavGroupId | null;
  /** Whether it is a screen of the menu (it is what an empty search lists). */
  isEntry: boolean;
}

/** Every screen and section the person may open, for the search. */
export function searchTargets(can: Can): SearchTarget[] {
  const targets: SearchTarget[] = visibleEntries(can).map((entry) => ({
    key: entry.id,
    label: entry.label,
    path: targetOf(entry, can),
    groupId: entry.group,
    isEntry: true,
  }));
  const settings = NAV_ENTRIES.find((entry) => entry.id === 'settings');
  for (const section of SETTINGS_SECTIONS) {
    if (section.resources.some((resource) => can(resource, 'view'))) {
      targets.push({
        key: `settings:${section.path}`,
        label: `Configuración › ${section.label}`,
        path: section.path,
        groupId: settings?.group ?? null,
        isEntry: false,
      });
    }
  }
  for (const view of PARAMETER_VIEWS) {
    if (can(view.resource, 'view')) {
      targets.push({
        key: `parameter:${view.slug}`,
        label: `Configuración › Parámetros › ${view.label}`,
        path: `/configuracion/parametros?parametro=${view.slug}`,
        groupId: settings?.group ?? null,
        isEntry: false,
      });
    }
  }
  const catalog = NAV_ENTRIES.find((entry) => entry.id === 'catalog');
  for (const view of CATALOG_VIEWS) {
    if (can(view.resource, 'view')) {
      targets.push({
        key: `catalog:${view.slug}`,
        label: `${catalog?.label ?? 'Catálogo'} › ${view.label}`,
        path: `/catalogo?parametro=${view.slug}`,
        groupId: catalog?.group ?? null,
        isEntry: false,
      });
    }
  }
  return targets;
}

/** Lower case without accents, so «configuracion» finds «Configuración». */
function plain(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * The targets that match what was typed, best first: a label that starts with it, then one with a word that starts
 * with it, then one that merely contains it. Without text, the screens of the menu.
 */
export function matchTargets(targets: readonly SearchTarget[], query: string): SearchTarget[] {
  const needle = plain(query.trim());
  if (needle === '') {
    return targets.filter((target) => target.isEntry);
  }
  const scored: { target: SearchTarget; rank: number; order: number }[] = [];
  targets.forEach((target, order) => {
    const label = plain(target.label);
    const last = plain(target.label.split('›').pop() ?? target.label).trim();
    let rank = -1;
    if (last.startsWith(needle)) {
      rank = 0;
    } else if (last.split(/\s+/).some((word) => word.startsWith(needle))) {
      rank = 1;
    } else if (label.includes(needle)) {
      rank = 2;
    }
    if (rank >= 0) {
      scored.push({ target, rank, order });
    }
  });
  return scored.sort((a, b) => a.rank - b.rank || a.order - b.order).map(({ target }) => target);
}

/** The label of a group. */
export function groupLabel(id: NavGroupId | null): string {
  return NAV_GROUPS.find((group) => group.id === id)?.label ?? '';
}
