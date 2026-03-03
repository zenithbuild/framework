import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJsonPath = path.join(__dirname, 'package.json');

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const deps = Object.keys(packageJson.dependencies || {});
const optionalDeps = Object.keys(packageJson.optionalDependencies || {});
const zenithDeps = deps.filter((dep) => dep.startsWith('@zenithbuild/'));
const zenithOptionalDeps = optionalDeps.filter((dep) => dep.startsWith('@zenithbuild/'));

const allowedOptional = new Set([
  '@zenithbuild/bundler-darwin-arm64',
  '@zenithbuild/bundler-darwin-x64',
  '@zenithbuild/bundler-linux-x64',
  '@zenithbuild/bundler-win32-x64'
]);

for (const dep of zenithDeps) {
  assert.equal(
    zenithDeps.includes(dep),
    false,
    `Dependency contract violation: @zenithbuild/bundler meta package must not hard-depend on ${dep}`
  );
}

for (const dep of allowedOptional) {
  assert.equal(
    zenithOptionalDeps.includes(dep),
    true,
    `Dependency contract violation: @zenithbuild/bundler must include optional dependency ${dep}`
  );
}

console.log('dependency_contract.spec.js passed');
