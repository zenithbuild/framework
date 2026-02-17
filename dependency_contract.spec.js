import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJsonPath = path.join(__dirname, 'package.json');

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const deps = Object.keys(packageJson.dependencies || {});
const zenithDeps = deps.filter((dep) => dep.startsWith('@zenithbuild/'));

const allowed = new Set([
  '@zenithbuild/core',
  '@zenithbuild/router',
  '@zenithbuild/runtime'
]);

for (const dep of zenithDeps) {
  assert.equal(
    allowed.has(dep),
    true,
    `Dependency contract violation: zenith-bundler must not depend on ${dep}`
  );
}

for (const dep of allowed) {
  assert.equal(
    zenithDeps.includes(dep),
    true,
    `Dependency contract violation: zenith-bundler must include ${dep}`
  );
}

console.log('dependency_contract.spec.js passed');
