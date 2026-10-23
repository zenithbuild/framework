import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const PACKAGE_DIRS = ['packages/bundler-darwin-arm64', 'packages/bundler-darwin-x64'];
const ARM64 = '@zenithbuild/bundler-darwin-arm64';
const X64 = '@zenithbuild/bundler-darwin-x64';

// Stub `npm` placed first on PATH. FAKE_NPM_MISSING lists names that 404;
// FAKE_NPM_BROKEN lists names whose lookup fails with a network error.
function createStubNpm(dir) {
  const scriptPath = path.join(dir, 'npm');
  const script = [
    '#!/usr/bin/env node',
    'const fs = require("node:fs");',
    'const path = require("node:path");',
    'const args = process.argv.slice(2);',
    'const [command = "", target = "", field = ""] = args;',
    'fs.appendFileSync(process.env.FAKE_NPM_LOG, `${command}|${target}|${field}\\n`);',
    'const list = (key) => (process.env[key] || "").split(",").filter(Boolean);',
    'if (command === "view") {',
    '  const name = target.replace(/(.)@.*$/, "$1");',
    '  if (list("FAKE_NPM_BROKEN").includes(name)) {',
    '    process.stderr.write("npm error code ETIMEDOUT\\nnpm error network request to registry failed\\n");',
    '    process.exit(1);',
    '  }',
    '  if (list("FAKE_NPM_MISSING").includes(name) || target !== name) {',
    '    process.stderr.write("npm error code E404\\nnpm error 404 Not Found - GET https://registry.npmjs.org/pkg\\n");',
    '    process.exit(1);',
    '  }',
    '  const payload = { version: "0.0.1", versions: ["0.0.1"], "dist-tags": { latest: "0.0.1" } }[field];',
    '  process.stdout.write(JSON.stringify(payload));',
    '  process.exit(0);',
    '}',
    'if (command === "pack") {',
    '  const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));',
    '  const files = new Set(["package.json"]);',
    '  for (const entry of manifest.files || []) {',
    '    if (["README.md", "LICENSE", "package.json"].includes(entry)) files.add(entry);',
    '    if (entry === "bin" || entry === "bin/**") files.add("bin/zenith-bundler");',
    '  }',
    '  process.stdout.write(JSON.stringify([{ files: [...files].map((filePath) => ({ path: filePath })) }]));',
    '  process.exit(0);',
    '}',
    'if (command === "publish") {',
    '  process.stdout.write("published\\n");',
    '  process.exit(0);',
    '}',
    'process.stderr.write(`unexpected stub npm command: ${args.join(" ")}\\n`);',
    'process.exit(97);'
  ].join('\n');

  writeFileSync(scriptPath, script, 'utf8');
  chmodSync(scriptPath, 0o755);
}

function runPublish({ missing = [], broken = [], dryRun = false } = {}) {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'zenith-publish-preflight-'));
  const logPath = path.join(tempDir, 'npm.log');
  createStubNpm(tempDir);
  const env = { ...process.env };
  delete env.NPM_BIN;
  delete env.NPM_CONFIG_TAG;
  delete env.npm_config_tag;

  try {
    const args = ['./scripts/publish-packages.sh', ...(dryRun ? ['--dry-run'] : [])];
    const result = spawnSync('bash', args, {
      cwd: ROOT,
      env: {
        ...env,
        PATH: `${tempDir}${path.delimiter}${process.env.PATH}`,
        PUBLISH_PACKAGE_FILTER: PACKAGE_DIRS.join(','),
        FAKE_NPM_MISSING: missing.join(','),
        FAKE_NPM_BROKEN: broken.join(','),
        FAKE_NPM_LOG: logPath
      },
      encoding: 'utf8'
    });
    const calls = existsSync(logPath) ? readFileSync(logPath, 'utf8').trim().split('\n') : [];
    return { result, calls, publishes: calls.filter((line) => line.startsWith('publish|')) };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function describe(result) {
  return `exit ${result.status}\n${result.stdout}\n${result.stderr}`;
}

test('preflight passes and publishes proceed when every selected name exists', () => {
  const { result, calls, publishes } = runPublish();

  assert.equal(result.status, 0, describe(result));
  assert.match(result.stdout, /Preflight: checking that every selected package name exists on npm/);
  assert.match(result.stdout, new RegExp(`ok: ${ARM64}`));
  assert.match(result.stdout, new RegExp(`ok: ${X64}`));
  assert.equal(publishes.length, 2);
  const firstPublish = calls.findIndex((line) => line.startsWith('publish|'));
  for (const name of [ARM64, X64]) {
    const lookup = calls.indexOf(`view|${name}|version`);
    assert.ok(lookup !== -1 && lookup < firstPublish, `expected ${name} lookup before first publish`);
  }
});

test('one missing name exits 1 before any publish and names the package', () => {
  const { result, publishes } = runPublish({ missing: [X64] });

  assert.equal(result.status, 1, describe(result));
  assert.deepEqual(publishes, []);
  assert.match(result.stderr, new RegExp(`::error::Bootstrap required: ${X64}\\. Nothing was published\\.`));
  assert.doesNotMatch(result.stderr, new RegExp(`Bootstrap required: [^\\n]*${ARM64}`));
  assert.match(result.stderr, /Publish once manually or with temporary token, then configure Trusted Publishers\./);
  assert.match(result.stderr, /bootstrap-platform-packages\.yml/);
});

test('two missing names are both listed and nothing publishes', () => {
  const { result, publishes } = runPublish({ missing: [ARM64, X64] });

  assert.equal(result.status, 1, describe(result));
  assert.deepEqual(publishes, []);
  assert.match(result.stderr, new RegExp(`::error::Bootstrap required: ${ARM64}, ${X64}\\.`));
});

test('registry errors fail closed with exit 2 and a network message, not a bootstrap message', () => {
  const { result, publishes } = runPublish({ broken: [ARM64], missing: [X64] });

  assert.equal(result.status, 2, describe(result));
  assert.deepEqual(publishes, []);
  assert.match(result.stderr, new RegExp(`::error::Publish preflight could not query the npm registry for: ${ARM64}\\.`));
  assert.match(result.stderr, /network, registry or auth failure, not a missing package/);
  assert.match(result.stderr, /ETIMEDOUT/);
  assert.match(result.stderr, new RegExp(`Also not yet published on npm: ${X64}`));
  assert.doesNotMatch(result.stderr, /::error::Bootstrap required/);
});

test('dry-run still runs the preflight and reports missing names', () => {
  const { result, calls, publishes } = runPublish({ missing: [ARM64], dryRun: true });

  assert.equal(result.status, 1, describe(result));
  assert.match(result.stdout, /Mode=dry-run/);
  assert.ok(calls.includes(`view|${ARM64}|version`));
  assert.deepEqual(publishes, []);
  assert.match(result.stderr, new RegExp(`::error::Bootstrap required: ${ARM64}\\.`));
});
