import { describe, expect, it } from 'vitest';
import { groupBySection } from './permissionSections';

const resource = (code: string) => ({ code, name: code });

describe('groupBySection', () => {
  it('groups the modules by section, in the order of the section', () => {
    const sections = groupBySection(
      ['sequences', 'users', 'departments', 'company', 'audit_logs', 'roles'].map(resource),
    );

    expect(sections.map((section) => [section.label, section.items.map((i) => i.code)])).toEqual([
      ['Acceso', ['users', 'roles', 'audit_logs']],
      ['Organización', ['departments']],
      ['Configuración', ['company', 'sequences']],
    ]);
  });

  it('drops the sections with no module', () => {
    const sections = groupBySection([resource('departments')]);

    expect(sections.map((section) => section.id)).toEqual(['organization']);
  });

  it('puts a module nobody listed under «Otros», so a new one never goes missing', () => {
    const sections = groupBySection(['users', 'payroll', 'contacts'].map(resource));

    expect(sections.map((section) => section.label)).toEqual(['Acceso', 'Otros']);
    expect(sections[1]?.items.map((item) => item.code)).toEqual(['payroll', 'contacts']);
  });

  it('is empty without modules', () => {
    expect(groupBySection([])).toEqual([]);
  });
});
