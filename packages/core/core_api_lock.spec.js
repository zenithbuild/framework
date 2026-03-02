import assert from 'node:assert/strict';

// Policy B: root surface is a stable product API; do not add exports without a contract decision.
const core = await import('@zenithbuild/core');
const ir = await import('@zenithbuild/core/ir');
const schema = await import('@zenithbuild/core/schema');
const coreTemplate = await import('@zenithbuild/core/core-template');

const expectedRootKeys = [
  'BROWSER_GLOBALS',
  'ErrorCodes',
  'FORBIDDEN_PATTERNS',
  'IR_SCHEMA',
  'IR_VERSION',
  'canonicalize',
  'containsForbiddenPattern',
  'coreModuleSource',
  'createError',
  'extractParams',
  'fileToRoute',
  'formatError',
  'formatVersion',
  'getDefaults',
  'hash',
  'hashShort',
  'isCorrectOrder',
  'isDynamic',
  'isZenithError',
  'loadConfig',
  'normalizeSeparators',
  'parseSemver',
  'sortAlpha',
  'sortRoutes',
  'validateCompatibility',
  'validateConfig',
  'validateRouteParams'
];

assert.deepEqual(
  expectedRootKeys,
  [...expectedRootKeys].sort(),
  'expectedRootKeys must stay lexicographically sorted for deterministic API lock reviews'
);

assert.deepEqual(
  Object.keys(core).sort(),
  expectedRootKeys,
  'Root API export surface drifted; update this lock intentionally if contract changes'
);

assert.equal(typeof ir.IR_VERSION, 'number', 'Subpath @zenithbuild/core/ir must export IR_VERSION');
assert.equal(typeof ir.IR_SCHEMA, 'object', 'Subpath @zenithbuild/core/ir must export IR_SCHEMA');
assert.equal(typeof schema.IR_VERSION, 'number', 'Subpath @zenithbuild/core/schema must export IR_VERSION');
assert.equal(
  typeof coreTemplate.coreModuleSource,
  'function',
  'Subpath @zenithbuild/core/core-template must export coreModuleSource'
);

console.log('core_api_lock.spec.js passed');
