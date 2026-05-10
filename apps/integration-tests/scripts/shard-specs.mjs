import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const INTEGRATION_ROOT = resolve(__dirname, '..');

export const INTENTIONAL_NON_JEST_TESTS = new Map([
  [
    'router_single_click_integration.test.js',
    'node:test + Playwright smoke path; kept outside Jest shards because it manages a browser and dev server directly.'
  ]
]);

function isFile(entry) {
  return typeof entry === 'string' || entry.isFile();
}

function entryName(entry) {
  return typeof entry === 'string' ? entry : entry.name;
}

export function collectIntegrationShardSpecs({
  root = INTEGRATION_ROOT,
  readDir = readdirSync,
  intentionalNonJestTests = INTENTIONAL_NON_JEST_TESTS
} = {}) {
  const files = readDir(root, { withFileTypes: true })
    .filter(isFile)
    .map(entryName)
    .sort();

  const jestSpecs = files.filter((name) => name.endsWith('.spec.js'));
  const rootTests = files.filter((name) => name.endsWith('.test.js'));
  const unaccountedTests = rootTests.filter((name) => !intentionalNonJestTests.has(name));

  if (unaccountedTests.length > 0) {
    throw new Error(
      `Integration tests are not assigned to CI shards or explicit exclusions: ${unaccountedTests.join(', ')}`
    );
  }
  if (jestSpecs.length === 0) {
    throw new Error(`No integration Jest specs found under ${root}`);
  }

  return jestSpecs;
}

export function selectShardSpecs(specs, shardIndex, shardTotal) {
  return specs.filter((_, index) => index % shardTotal === shardIndex - 1);
}
