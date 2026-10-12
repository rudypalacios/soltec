// Joins contract/openapi.yaml (the root) with contract/modules/*.yaml into one OpenAPI document.
//
// Each module is a partial document with only `paths` and `components`. Its references stay `#/components/...`
// because every component ends up in the same document. Nothing may be defined twice: a duplicate path or
// component is an error, not a silent overwrite.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const COMPONENT_SECTIONS = ['parameters', 'responses', 'schemas'];

const load = (file) => {
  const document = YAML.parse(readFileSync(file, 'utf8'));
  if (document === null || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error(`${file}: expected a YAML mapping`);
  }
  return document;
};

const mergeInto = (target, source, where, file) => {
  for (const [key, value] of Object.entries(source ?? {})) {
    if (Object.hasOwn(target, key)) throw new Error(`${file}: ${where} "${key}" is already defined elsewhere`);
    target[key] = value;
  }
};

/** @param {string} contractDir directory with openapi.yaml and modules/ */
export function bundleContract(contractDir) {
  const root = load(join(contractDir, 'openapi.yaml'));
  root.paths ??= {};
  root.components ??= {};

  const modulesDir = join(contractDir, 'modules');
  const files = readdirSync(modulesDir).filter((name) => name.endsWith('.yaml')).sort();
  for (const name of files) {
    const file = join(modulesDir, name);
    const module = load(file);
    const unknown = Object.keys(module).filter((key) => key !== 'paths' && key !== 'components');
    if (unknown.length > 0) throw new Error(`${file}: only "paths" and "components" are allowed, found ${unknown.join(', ')}`);

    mergeInto(root.paths, module.paths, 'path', file);
    for (const [section, entries] of Object.entries(module.components ?? {})) {
      if (!COMPONENT_SECTIONS.includes(section)) throw new Error(`${file}: unsupported components section "${section}"`);
      root.components[section] ??= {};
      mergeInto(root.components[section], entries, `components.${section}`, file);
    }
  }
  return root;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const contractDir = dirname(fileURLToPath(import.meta.url));
  const outDir = join(contractDir, 'dist');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'openapi.yaml'), YAML.stringify(bundleContract(contractDir), { lineWidth: 0 }));
}
