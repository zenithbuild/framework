import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJsonPath = path.join(__dirname, 'package.json');

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const deps = Object.keys(packageJson.dependencies || {});

for (const dep of deps) {
  assert.equal(
    dep.startsWith('@zenithbuild/'),
    true,
    `Dependency contract violation: zenith-core runtime deps must stay within @zenithbuild/*, found ${dep}`
  );
}

console.log('dependency_contract.spec.js passed');
