import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const scanDirs = [
  path.join(repoRoot, 'scripts'),
  path.join(repoRoot, 'src'),
  path.join(repoRoot, 'tests')
];

const scanTopLevelFiles = [
  path.join(repoRoot, 'index.js'),
  path.join(repoRoot, 'index.mjs'),
  path.join(repoRoot, 'cli.js'),
  path.join(repoRoot, 'build.js'),
  path.join(repoRoot, 'build.mjs')
];

const ignoreDirNames = new Set([
  'node_modules',
  'dist',
  'target',
  '.git',
  'audit-output'
]);

function isJsFile(filePath) {
  return (
    filePath.endsWith('.js') ||
    filePath.endsWith('.mjs') ||
    filePath.endsWith('.cjs')
  );
}

function walkJsFiles(dir, out = []) {
  if (!existsSync(dir)) return out;

  for (const entry of readdirSync(dir)) {
    if (ignoreDirNames.has(entry)) continue;

    const fullPath = path.join(dir, entry);
    const info = statSync(fullPath);

    if (info.isDirectory()) {
      walkJsFiles(fullPath, out);
      continue;
    }

    if (info.isFile() && isJsFile(fullPath)) {
      out.push(fullPath);
    }
  }

  return out;
}

function extractZenithSpecifiers(source) {
  const patterns = [
    /\bimport\s+(?:[^'"\n;]*?\s+from\s+)?['"](@zenithbuild\/[^'"]+)['"]/g,
    /\bexport\s+[^'"\n;]*?\s+from\s+['"](@zenithbuild\/[^'"]+)['"]/g,
    /\bimport\s*\(\s*['"](@zenithbuild\/[^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"](@zenithbuild\/[^'"]+)['"]\s*\)/g
  ];
  const specifiers = new Set();

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      specifiers.add(match[1]);
    }
  }

  return [...specifiers];
}

function scanFile(filePath, violations) {
  const source = readFileSync(filePath, 'utf8');
  const specifiers = extractZenithSpecifiers(source);

  for (const specifier of specifiers) {
    if (specifier.startsWith('@zenithbuild/router') && specifier !== '@zenithbuild/router/template') {
      violations.push(`${filePath}: forbidden router import "${specifier}"`);
      continue;
    }

    if (specifier.startsWith('@zenithbuild/runtime') && specifier !== '@zenithbuild/runtime/template') {
      violations.push(`${filePath}: forbidden runtime import "${specifier}"`);
      continue;
    }

    if (specifier.startsWith('@zenithbuild/core')) {
      const allowed = new Set([
        '@zenithbuild/core/ir',
        '@zenithbuild/core/core-template'
      ]);
      if (!allowed.has(specifier)) {
        violations.push(`${filePath}: forbidden core import "${specifier}"`);
      }
    }
  }
}

test('bundler import boundary: only contract subpaths for router/runtime/core', () => {
  const jsFiles = [];

  for (const dir of scanDirs) {
    walkJsFiles(dir, jsFiles);
  }

  for (const filePath of scanTopLevelFiles) {
    if (existsSync(filePath) && statSync(filePath).isFile() && isJsFile(filePath)) {
      jsFiles.push(filePath);
    }
  }

  assert.ok(
    jsFiles.length > 0,
    'expected JS files across scripts/, src/, tests/, or repo root entrypoints for boundary scan'
  );

  jsFiles.sort();
  const uniqueFiles = Array.from(new Set(jsFiles));

  const violations = [];
  for (const filePath of uniqueFiles) {
    scanFile(filePath, violations);
  }

  if (violations.length) {
    violations.sort();
    assert.fail(`Import boundary violations:\n${violations.join('\n')}`);
  }

  assert.deepEqual(violations, []);
});
