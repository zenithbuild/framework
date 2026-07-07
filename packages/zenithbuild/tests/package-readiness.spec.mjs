import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const PKG_ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));

const REQUIRED_FILES = [
  'package.json',
  'README.md',
  'AGENTS.md',
  'SKILL.md',
  'install.md',
  'detection.md',
  'LICENSE',
  'rules/zenith-agent-contract.md',
  'rules/zenith-dom-rules.md',
  'rules/zenith-routing-rules.md',
  'rules/zenith-tailwind-rules.md',
  'examples/component.zen',
  'examples/interactive-menu.zen',
  'examples/protected-route.zen',
];

const FORBIDDEN_ZEN_PATTERNS = [
  'onClick=',
  'onclick=',
  '@click=',
  '{#if}',
  '{#each}',
  'document.querySelector',
  'querySelector(',
  'addEventListener(',
];

const REQUIRED_TERMS = [
  'on:<event>={handler}',
  'state',
  'signal',
  'ref<T>()',
  'guard',
  'load',
  'Tailwind',
];

function read(relPath) {
  return readFileSync(path.join(PKG_ROOT, relPath), 'utf8');
}

function readJson(relPath) {
  return JSON.parse(read(relPath));
}

function walkFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

function relative(relPath) {
  return path.relative(process.cwd(), path.join(PKG_ROOT, relPath));
}

// 1. Required files exist
test('required package files exist', () => {
  for (const file of REQUIRED_FILES) {
    assert.doesNotThrow(() => read(file), `missing required file: ${relative(file)}`);
  }
});

// 2. package.json metadata
test('package.json metadata is npm-ready', () => {
  const pkg = readJson('package.json');
  assert.equal(pkg.name, 'zenithbuild', `expected name zenithbuild, got ${pkg.name}`);
  assert.ok(typeof pkg.version === 'string' && pkg.version.length > 0, 'version must be a non-empty string');
  assert.ok(pkg.private === false || pkg.private === undefined, 'private must be false or absent');
  assert.equal(pkg.type, 'module', 'type must be module');
  assert.equal(pkg.license, 'MIT', 'license must be MIT');

  const files = Array.isArray(pkg.files) ? pkg.files : [];
  const includes = (pattern) =>
    files.some((entry) => entry === pattern || entry.startsWith(pattern.replace('/**', '/')));

  assert.ok(includes('README.md'), 'files must include README.md');
  assert.ok(includes('AGENTS.md'), 'files must include AGENTS.md');
  assert.ok(includes('SKILL.md'), 'files must include SKILL.md');
  assert.ok(includes('install.md'), 'files must include install.md');
  assert.ok(includes('detection.md'), 'files must include detection.md');
  assert.ok(includes('LICENSE'), 'files must include LICENSE');
  assert.ok(includes('rules/**'), 'files must include rules/**');
  assert.ok(includes('examples/**'), 'files must include examples/**');
});

// 3. File size rule
test('no package file exceeds 500 lines', () => {
  const allFiles = walkFiles(PKG_ROOT);
  const tooLong = [];
  for (const file of allFiles) {
    const content = readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/).length;
    if (lines > 500) {
      tooLong.push(`${path.relative(process.cwd(), file)} (${lines} lines)`);
    }
  }
  assert.deepEqual(tooLong, [], 'files must not exceed 500 lines');
});

// 4. Required Zenith contract terms exist in docs
test('required Zenith contract terms are present in docs', () => {
  const docFiles = [
    'AGENTS.md',
    'SKILL.md',
    'rules/zenith-agent-contract.md',
    'rules/zenith-dom-rules.md',
    'rules/zenith-routing-rules.md',
    'rules/zenith-tailwind-rules.md',
  ];
  const combined = docFiles.map(read).join('\n');
  for (const term of REQUIRED_TERMS) {
    assert.ok(
      combined.includes(term),
      `required contract term missing from docs: ${term}`
    );
  }
});

// 5. Forbidden drift not present in .zen examples
test('forbidden framework drift is absent from .zen examples', () => {
  const exampleDir = path.join(PKG_ROOT, 'examples');
  const examples = readdirSync(exampleDir)
    .filter((name) => name.endsWith('.zen'))
    .map((name) => path.join('examples', name));

  for (const example of examples) {
    const content = read(example);
    for (const pattern of FORBIDDEN_ZEN_PATTERNS) {
      assert.ok(
        !content.includes(pattern),
        `${relative(example)} contains forbidden pattern: ${pattern}`
      );
    }
  }
});

// 6. interactive-menu.zen models DOM-driven state with state, not signal()
test('interactive-menu.zen uses state for DOM-driven open state', () => {
  const content = read('examples/interactive-menu.zen');
  assert.ok(
    content.includes('state localOpen'),
    'interactive-menu.zen must declare local open state with `state`'
  );
  assert.ok(
    !content.includes('const localOpen = signal'),
    'interactive-menu.zen must not use signal() for local open state'
  );
});
