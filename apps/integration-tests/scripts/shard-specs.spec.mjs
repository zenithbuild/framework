import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectIntegrationShardSpecs,
  INTENTIONAL_NON_JEST_TESTS,
  selectShardSpecs
} from './shard-specs.mjs';

test('integration shard specs are derived from filesystem in deterministic order', () => {
  const specs = collectIntegrationShardSpecs({
    readDir: () => [
      'phase2.spec.js',
      'README.md',
      'phase1.spec.js',
      'router_single_click_integration.test.js'
    ]
  });

  assert.deepEqual(specs, ['phase1.spec.js', 'phase2.spec.js']);
});

test('integration shard discovery fails on unaccounted root test files', () => {
  assert.throws(
    () => collectIntegrationShardSpecs({
      readDir: () => ['phase1.spec.js', 'new-flow.test.js']
    }),
    /new-flow\.test\.js/
  );
});

test('intentional non-Jest integration exclusions are explicit', () => {
  assert.equal(
    INTENTIONAL_NON_JEST_TESTS.has('router_single_click_integration.test.js'),
    true
  );
  assert.match(
    INTENTIONAL_NON_JEST_TESTS.get('router_single_click_integration.test.js'),
    /node:test \+ Playwright/
  );
});

test('shard selection remains stable by modulo index', () => {
  const specs = ['a.spec.js', 'b.spec.js', 'c.spec.js', 'd.spec.js', 'e.spec.js'];
  assert.deepEqual(selectShardSpecs(specs, 1, 2), ['a.spec.js', 'c.spec.js', 'e.spec.js']);
  assert.deepEqual(selectShardSpecs(specs, 2, 2), ['b.spec.js', 'd.spec.js']);
});
