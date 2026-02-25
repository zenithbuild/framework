import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const scriptPath = path.join(__dirname, 'scripts', 'render-assets.mjs');
const source = readFileSync(scriptPath, 'utf8');

assert.ok(
  source.includes("from '@zenithbuild/runtime/template'"),
  'bundler bridge must import runtime template subpath'
);
assert.ok(
  source.includes("from '@zenithbuild/router/template'"),
  'bundler bridge must import router template subpath'
);

assert.equal(
  source.includes("from '@zenithbuild/runtime'"),
  false,
  'bundler bridge must not import runtime root API'
);
assert.equal(
  source.includes("from '@zenithbuild/router'"),
  false,
  'bundler bridge must not import router root API'
);
assert.equal(
  source.includes("from '@zenithbuild/core'"),
  false,
  'bundler bridge must not import core root API for authority checks'
);

console.log('contract-scan.mjs passed');
