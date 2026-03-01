import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { coreModuleSource } from '@zenithbuild/core/core-template';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const goldenPath = path.join(__dirname, 'core-template.golden.js');
const runtimeImport = '/assets/runtime.11111111.js';

const sourceA = coreModuleSource(runtimeImport);
const sourceB = coreModuleSource(runtimeImport);

assert.equal(typeof sourceA, 'string', 'coreModuleSource() must return a string');
assert.ok(sourceA.length > 0, 'coreModuleSource() output must not be empty');
assert.equal(sourceA, sourceB, 'core template bytes must be deterministic for identical input');
assert.equal(sourceA.includes('\r'), false, 'core template output must use \\n newlines only');

assert.equal(sourceA.includes('.zen'), false, 'core template output must not contain .zen');
assert.equal(sourceA.includes('zenith:'), false, 'core template output must not contain zenith:');
assert.equal(sourceA.includes('fetch('), false, 'core template output must not contain fetch(');
assert.equal(sourceA.includes('new Function'), false, 'core template output must not contain new Function');
assert.equal(sourceA.includes('eval('), false, 'core template output must not contain eval(');

const importLine =
  `import { signal, state, zeneffect, zenEffect as __zenithZenEffect, zenMount as __zenithZenMount } from ${JSON.stringify(runtimeImport)};`;
assert.equal(
  sourceA.includes(importLine),
  true,
  'core template must embed runtimeImport as a literal ESM import specifier'
);
assert.equal(
  sourceA.includes(runtimeImport),
  true,
  'core template must include the provided runtime import verbatim'
);

const golden = readFileSync(goldenPath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
assert.equal(sourceA, golden, 'core template output must match core-template.golden.js exactly');

console.log('template-contract.spec.js passed');
