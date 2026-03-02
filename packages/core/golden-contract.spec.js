import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { coreModuleSource } from '@zenithbuild/core/core-template';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const goldenPath = path.join(__dirname, 'core-template.golden.js');
const runtimeImport = '/assets/runtime.11111111.js';

const generated = coreModuleSource(runtimeImport);
const golden = readFileSync(goldenPath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

assert.equal(golden.includes('\r'), false, 'core-template.golden.js must use \\n newlines only');
assert.equal(generated, golden, 'core-template.golden.js must stay synchronized with coreModuleSource()');

console.log('golden-contract.spec.js passed');
