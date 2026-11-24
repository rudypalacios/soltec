import { describe, expect, it } from 'vitest';
import {
  activeEntry,
  groupLabel,
  matchTargets,
  NAV_ENTRIES,
  searchTargets,
  targetOf,
  visibleEntries,
  visibleGroups,
  type Can,
} from './navigation';

const everything: Can = () => true;
const only =
  (...resources: string[]): Can =>
  (resource, action) =>
    action === 'view' && resources.includes(resource);

describe('visible groups', () => {
  it('draws every group, with its screens in order, for someone who may open everything', () => {
    expect(visibleGroups(everything).map(({ group }) => group.label)).toEqual([
      'Trabajo',
      'Comercial',
      'Catálogo',
      'Administración',
    ]);
    expect(
      visibleGroups(everything).map(({ entries }) => entries.map((entry) => entry.label)),
    ).toEqual([
      ['Tareas'],
      ['Clientes', 'Contactos'],
      ['Productos', 'Proveedores', 'Parámetros del catálogo'],
      ['Usuarios', 'Perfiles', 'Departamentos', 'Auditoría', 'Configuración'],
    ]);
  });

  it('leaves out a group when nothing in it may be opened', () => {
    const groups = visibleGroups(only('clients', 'users'));

    expect(groups.map(({ group }) => group.id)).toEqual(['work', 'commercial', 'admin']);
    expect(groups[1]?.entries.map((entry) => entry.label)).toEqual(['Clientes']);
    expect(groups[2]?.entries.map((entry) => entry.label)).toEqual(['Usuarios']);
  });

  it('keeps Tareas and Inicio for anyone, since neither asks for a permission', () => {
    expect(visibleEntries(only()).map((entry) => entry.label)).toEqual(['Inicio', 'Tareas']);
    expect(visibleGroups(only()).map(({ group }) => group.id)).toEqual(['work']);
  });

  it('opens Productos on bundles when that is the only tab the person may view', () => {
    const products = NAV_ENTRIES.find((entry) => entry.id === 'products');

    expect(products && targetOf(products, only('bundles'))).toBe('/paquetes');
    expect(products && targetOf(products, only('products', 'bundles'))).toBe('/productos');
  });
});

describe('active entry', () => {
  const all = [...NAV_ENTRIES];

  it('is the entry of the address, of a section under it, or of its alternative address', () => {
    expect(activeEntry(all, '/')?.id).toBe('home');
    expect(activeEntry(all, '/clientes')?.id).toBe('clients');
    expect(activeEntry(all, '/clientes/0192')?.id).toBe('clients');
    expect(activeEntry(all, '/configuracion/flujos')?.id).toBe('settings');
    expect(activeEntry(all, '/paquetes')?.id).toBe('products');
  });

  it('is nothing for an address of no entry', () => {
    expect(activeEntry(all, '/cuenta/sesiones')).toBeUndefined();
    expect(activeEntry(all, '/clientesx')).toBeUndefined();
  });
});

describe('search', () => {
  const targets = searchTargets(everything);
  const labels = (query: string) => matchTargets(targets, query).map((target) => target.label);

  it('lists the screens of the menu when nothing is typed', () => {
    expect(labels('')).toEqual(visibleEntries(everything).map((entry) => entry.label));
  });

  it('ignores accents and case, and puts a label that starts with the text first', () => {
    expect(labels('CONFIGURACION')[0]).toBe('Configuración');
    // Both labels start with «co»; the sections whose last word merely starts with it come after.
    expect(labels('co').slice(0, 2)).toEqual(['Contactos', 'Configuración']);
    expect(labels('co')).toContain('Configuración › Parámetros › Tipos de contacto');
  });

  it('finds the sections inside a screen, with their route', () => {
    expect(labels('flujos')).toEqual(['Configuración › Flujos de estado']);
    expect(labels('marcas')).toEqual(['Parámetros del catálogo › Marcas']);
    const marcas = matchTargets(targets, 'marcas')[0];
    expect(marcas?.path).toBe('/catalogo?parametro=brands');
    expect(groupLabel(marcas?.groupId ?? null)).toBe('Catálogo');
  });

  it('offers only what the person may open', () => {
    const limited = searchTargets(only('company', 'brands'));

    expect(matchTargets(limited, 'empresa').map((target) => target.label)).toEqual([
      'Configuración › Empresa',
    ]);
    expect(matchTargets(limited, 'finanzas')).toEqual([]);
    expect(matchTargets(limited, 'marcas').map((target) => target.path)).toEqual([
      '/catalogo?parametro=brands',
    ]);
  });

  it('finds nothing for text that matches no screen', () => {
    expect(labels('zzz')).toEqual([]);
  });
});
