import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();

function makeTempDir(prefix) {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function createFakeNpm(dir, missingPackages) {
  const scriptPath = path.join(dir, 'fake-npm.js');
  const script = [
    '#!/usr/bin/env node',
    'const args = process.argv.slice(2);',
    'const command = args[0] || "";',
    'const target = args[1] || "";',
    `const missing = new Set(${JSON.stringify([...missingPackages])});`,
    'if (command === "view") {',
    '  const packageName = target.replace(/@[^@]+$/, "");',
    '  if (missing.has(target) || missing.has(packageName)) {',
    '    process.stderr.write(',
    '      `npm error code E404\\n` +',
    '      `npm error 404 Not Found - GET https://registry.npmjs.org/${encodeURIComponent(packageName)} - Not found\\n`',
    '    );',
    '    process.exit(1);',
    '  }',
    '  process.stdout.write(JSON.stringify("0.0.0-test"));',
    '  process.exit(0);',
    '}',
    'if (command === "publish") {',
    '  process.stderr.write("publish should not run during bootstrap aggregation test\\n");',
    '  process.exit(99);',
    '}',
    'process.stderr.write(`unexpected fake npm command: ${args.join(" ")}\\n`);',
    'process.exit(98);'
  ].join('\n');

  writeFileSync(scriptPath, script, 'utf8');
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

test('publish-train aggregates missing bootstrap packages into one summary', () => {
  const trainVersion = readFileSync(path.join(root, 'TRAIN_VERSION'), 'utf8').trim();
  const tempDir = makeTempDir('zenith-publish-train-bootstrap-');
  const missingPackages = new Set([
    `@zenithbuild/bundler-darwin-arm64@${trainVersion}`,
    '@zenithbuild/bundler-darwin-arm64',
    `@zenithbuild/bundler-darwin-x64@${trainVersion}`,
    '@zenithbuild/bundler-darwin-x64'
  ]);
  const fakeNpm = createFakeNpm(tempDir, missingPackages);

  try {
    const result = spawnSync('bash', ['./scripts/publish-train.sh'], {
      cwd: root,
      env: {
        ...process.env,
        NPM_BIN: fakeNpm,
        PUBLISH_PACKAGE_FILTER: 'packages/bundler-darwin-arm64,packages/bundler-darwin-x64'
      },
      encoding: 'utf8'
    });

    assert.equal(result.status, 1, `expected exit code 1, got ${result.status}\n${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /bootstrap required: package name not yet published on npm/);
    assert.match(
      result.stderr,
      /Bootstrap required: @zenithbuild\/bundler-darwin-arm64, @zenithbuild\/bundler-darwin-x64/
    );
    assert.match(
      result.stderr,
      /Publish once manually or with temporary token, then configure Trusted Publishers\./
    );
    assert.doesNotMatch(result.stderr, /Trusted publishing cannot bootstrap a brand-new npm package name/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
