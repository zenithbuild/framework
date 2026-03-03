import assert from 'node:assert/strict';
import { IR_VERSION } from './dist/ir/index.js';
import { coreModuleSource } from './dist/core-template.js';

assert.equal(typeof IR_VERSION, 'number', 'IR_VERSION must be numeric');
assert.equal(IR_VERSION > 0, true, 'IR_VERSION must be positive');

const source = coreModuleSource('/assets/runtime.11111111.js');
assert.equal(source.includes('.zen'), false, 'core template output must not contain .zen');
assert.equal(source.includes('zenith:'), false, 'core template output must not contain zenith:');
assert.equal(source.includes('fetch('), false, 'core template output must not contain fetch(');
assert.equal(source.includes('\r'), false, 'core template output must use \\n newlines');

console.log('contract-scan.mjs passed');
