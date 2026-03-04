import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const HELPER = path.join(ROOT, 'scripts/bootstrap-platform-package.mjs');

function makeTempDir(prefix) {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function makeFakeNpm(tempDir, scenario) {
  const scriptPath = path.join(tempDir, 'fake-npm');
  const lines = [
    '#!/usr/bin/env node',
    `const scenario = ${JSON.stringify(scenario)};`,
    'const args = process.argv.slice(2);',
    'const command = args[0] || "";',
    'if (command === "view") {',
    '  if (scenario === "exists") {',
    '    process.stdout.write(JSON.stringify("0.6.9"));',
    '    process.exit(0);',
    '  }',
    '  if (scenario === "missing") {',
    '    process.stderr.write("npm error code E404\\nnpm error 404 Not Found - GET https://registry.npmjs.org/pkg - Not found\\n");',
    '    process.exit(1);',
    '  }',
    '  if (scenario === "auth") {',
    '    process.stderr.write("npm error code E401\\nnpm error need auth\\n");',
    '    process.exit(1);',
    '  }',
    '}',
    'if (command === "publish") {',
    '  process.stdout.write("published\\n");',
    '  process.exit(0);',
    '}',
    'process.stderr.write(`unexpected command: ${args.join(" ")}\\n`);',
    'process.exit(2);'
  ];

  writeFileSync(scriptPath, lines.join('\n'), 'utf8');
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

function runHelper(npmBin, ...extraArgs) {
  return spawnSync(process.execPath, [HELPER, ...extraArgs], {
    cwd: ROOT,
    env: {
      ...process.env,
      NPM_BIN: npmBin
    },
    encoding: 'utf8'
  });
}

test('bootstrap helper treats npm 404 as publish-needed', () => {
  const tempDir = makeTempDir('zenith-bootstrap-helper-missing-');
  const fakeNpm = makeFakeNpm(tempDir, 'missing');

  try {
    const result = runHelper(
      fakeNpm,
      '--dry-run',
      'packages/bundler-linux-x64',
      '@zenithbuild/bundler-linux-x64',
      '0.6.9',
      'https://registry.npmjs.org/'
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /dry-run: would publish @zenithbuild\/bundler-linux-x64@0\.6\.9/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('bootstrap helper skips when version already exists', () => {
  const tempDir = makeTempDir('zenith-bootstrap-helper-exists-');
  const fakeNpm = makeFakeNpm(tempDir, 'exists');

  try {
    const result = runHelper(
      fakeNpm,
      '--dry-run',
      'packages/bundler-linux-x64',
      '@zenithbuild/bundler-linux-x64',
      '0.6.9',
      'https://registry.npmjs.org/'
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /skipped @zenithbuild\/bundler-linux-x64@0\.6\.9 \(already published\)/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('bootstrap helper fails on non-404 npm errors', () => {
  const tempDir = makeTempDir('zenith-bootstrap-helper-auth-');
  const fakeNpm = makeFakeNpm(tempDir, 'auth');

  try {
    const result = runHelper(
      fakeNpm,
      '--dry-run',
      'packages/bundler-linux-x64',
      '@zenithbuild/bundler-linux-x64',
      '0.6.9',
      'https://registry.npmjs.org/'
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Failed to check npm for @zenithbuild\/bundler-linux-x64@0\.6\.9/);
    assert.match(result.stderr, /E401/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
