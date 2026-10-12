import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { bundleContract } from './bundle.mjs';

const contractWith = (root, modules) => {
  const dir = mkdtempSync(join(tmpdir(), 'contract-'));
  mkdirSync(join(dir, 'modules'));
  writeFileSync(join(dir, 'openapi.yaml'), root);
  for (const [name, text] of Object.entries(modules)) writeFileSync(join(dir, 'modules', name), text);
  return dir;
};

const ROOT = 'openapi: 3.1.0\ncomponents:\n  schemas:\n    Problem:\n      type: object\n';

test('joins the paths and components of every module into the root', () => {
  const dir = contractWith(ROOT, {
    'a.yaml': 'paths:\n  /v1/a:\n    get: {}\ncomponents:\n  schemas:\n    A:\n      type: string\n',
    'b.yaml': 'paths:\n  /v1/b:\n    get: {}\ncomponents:\n  parameters:\n    B:\n      name: b\n',
  });

  const document = bundleContract(dir);

  assert.deepEqual(Object.keys(document.paths), ['/v1/a', '/v1/b']);
  assert.deepEqual(Object.keys(document.components.schemas), ['Problem', 'A']);
  assert.deepEqual(Object.keys(document.components.parameters), ['B']);
});

test('rejects a path defined in two modules', () => {
  const module = 'paths:\n  /v1/a:\n    get: {}\n';
  const dir = contractWith(ROOT, { 'a.yaml': module, 'b.yaml': module });

  assert.throws(() => bundleContract(dir), /path "\/v1\/a" is already defined/);
});

test('rejects a component that repeats one of the root', () => {
  const dir = contractWith(ROOT, { 'a.yaml': 'components:\n  schemas:\n    Problem:\n      type: string\n' });

  assert.throws(() => bundleContract(dir), /components\.schemas "Problem" is already defined/);
});

test('rejects keys other than paths and components', () => {
  const dir = contractWith(ROOT, { 'a.yaml': 'info: {}\n' });

  assert.throws(() => bundleContract(dir), /only "paths" and "components" are allowed/);
});
