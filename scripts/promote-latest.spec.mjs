import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const TRAIN_VERSION = readFileSync(path.join(ROOT, 'TRAIN_VERSION'), 'utf8').trim();

function makeTempDir(prefix) {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function createFakeNpm(dir) {
  const scriptPath = path.join(dir, 'fake-npm.js');
  const script = [
    '#!/usr/bin/env node',
    'const fs = require("node:fs");',
    'const args = process.argv.slice(2);',
    'const command = args[0] || "";',
    'const target = args[1] || "";',
    'const field = args[2] || "";',
    'const registryIndex = args.indexOf("--registry");',
    'const mode = process.env.FAKE_NPM_MODE || "promote";',
    'const logPath = process.env.FAKE_NPM_LOG || "";',
    'const trainVersion = process.env.FAKE_NPM_TRAIN_VERSION;',
    'const packages = process.env.FAKE_NPM_PACKAGES.split(",").filter(Boolean);',
    'const statePath = process.env.FAKE_NPM_STATE;',
    'if (!statePath) {',
    '  throw new Error("Missing FAKE_NPM_STATE");',
    '}',
    'const state = JSON.parse(fs.readFileSync(statePath, "utf8"));',
    'if (logPath) {',
    '  fs.appendFileSync(logPath, `${command}|${target}|${field}|registry=${registryIndex === -1 ? "" : args[registryIndex + 1] || ""}\\n`);',
    '}',
    'function writeState(next) {',
    '  fs.writeFileSync(statePath, JSON.stringify(next, null, 2));',
    '}',
    'function packageNameFor(spec) {',
    '  return spec.startsWith("@") ? spec.replace(/@[^@]+$/, "") : spec;',
    '}',
    'function notFound() {',
    '  process.stderr.write("npm error code E404\\nnpm error 404 Not Found - GET https://registry.npmjs.org/pkg - Not found\\n");',
    '  process.exit(1);',
    '}',
    'if (command === "view") {',
    '  if (field === "version" && target.endsWith(`@${trainVersion}`)) {',
    '    const packageName = packageNameFor(target);',
    '    if (mode === "missing-version" && packageName === packages[0]) {',
    '      notFound();',
    '    }',
    '    if (!state[packageName]) {',
    '      notFound();',
    '    }',
    '    process.stdout.write(JSON.stringify(trainVersion));',
    '    process.exit(0);',
    '  }',
    '  if (field === "dist-tags") {',
    '    const packageName = target;',
    '    if (!state[packageName]) {',
    '      notFound();',
    '    }',
    '    if (mode === "latest-ahead" && packageName === packages[0]) {',
    '      state[packageName].latest = "9.9.9";',
    '      writeState(state);',
    '    }',
    '    if (mode === "train-mismatch" && packageName === packages[0]) {',
    '      state[packageName].train = "0.6.16";',
    '      writeState(state);',
    '    }',
    '    process.stdout.write(JSON.stringify(state[packageName]));',
    '    process.exit(0);',
    '  }',
    '  process.stderr.write(`unexpected view target: ${target} ${field}\\n`);',
    '  process.exit(98);',
    '}',
    'if (command === "dist-tag" && args[1] === "add") {',
    '  const spec = args[2] || "";',
    '  const tag = args[3] || "";',
    '  const packageName = packageNameFor(spec);',
    '  if (tag !== "latest") {',
    '    process.stderr.write(`unexpected dist-tag target: ${spec} ${tag}\\n`);',
    '    process.exit(97);',
    '  }',
    '  state[packageName].latest = trainVersion;',
    '  writeState(state);',
    '  process.stdout.write(`+latest: ${spec}\\n`);',
    '  process.exit(0);',
    '}',
    'process.stderr.write(`unexpected fake npm command: ${args.join(" ")}\\n`);',
    'process.exit(96);',
  ].join('\n');

  writeFileSync(scriptPath, script, 'utf8');
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

function runPromoteLatest({ mode = 'promote', dryRun = false } = {}) {
  const tempDir = makeTempDir('zenith-promote-latest-');
  const fakeNpm = createFakeNpm(tempDir);
  const logPath = path.join(tempDir, 'fake-npm.log');
  const statePath = path.join(tempDir, 'state.json');
  const packageList = ['@zenithbuild/core', '@zenithbuild/cli'];

  writeFileSync(
    statePath,
    JSON.stringify(
      {
        '@zenithbuild/core': { latest: '0.6.12', train: TRAIN_VERSION, beta: '0.5.0-beta.2.20' },
        '@zenithbuild/cli': { latest: '0.6.12', train: TRAIN_VERSION, beta: '0.5.0-beta.2.20' },
      },
      null,
      2
    ),
    'utf8'
  );

  try {
    const args = dryRun ? ['./scripts/promote-latest.sh', '--dry-run'] : ['./scripts/promote-latest.sh'];
    const result = spawnSync('bash', args, {
      cwd: ROOT,
      env: {
        ...process.env,
        NPM_BIN: fakeNpm,
        PROMOTE_PACKAGE_FILTER: packageList.join(','),
        FAKE_NPM_MODE: mode,
        FAKE_NPM_LOG: logPath,
        FAKE_NPM_STATE: statePath,
        FAKE_NPM_TRAIN_VERSION: TRAIN_VERSION,
        FAKE_NPM_PACKAGES: packageList.join(','),
      },
      encoding: 'utf8',
    });

    const log = readFileSync(logPath, 'utf8');
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    return { result, log, state };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test('promote-latest upgrades latest to train version and preserves beta', () => {
  const { result, log, state } = runPromoteLatest();

  assert.equal(result.status, 0, `expected exit code 0, got ${result.status}\n${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, new RegExp(`Promoting @zenithbuild/core@${TRAIN_VERSION.replaceAll('.', '\\.')} -> latest`));
  assert.match(result.stdout, new RegExp(`Promoting @zenithbuild/cli@${TRAIN_VERSION.replaceAll('.', '\\.')} -> latest`));
  assert.equal(state['@zenithbuild/core'].latest, TRAIN_VERSION);
  assert.equal(state['@zenithbuild/cli'].latest, TRAIN_VERSION);
  assert.equal(state['@zenithbuild/core'].beta, '0.5.0-beta.2.20');
  assert.equal(state['@zenithbuild/cli'].beta, '0.5.0-beta.2.20');
  assert.match(log, new RegExp(`dist-tag\\|add\\|@zenithbuild/core@${TRAIN_VERSION.replaceAll('.', '\\.')}\\|`));
  assert.match(log, new RegExp(`dist-tag\\|add\\|@zenithbuild/cli@${TRAIN_VERSION.replaceAll('.', '\\.')}\\|`));
});

test('promote-latest fails loudly when latest is ahead of train', () => {
  const { result, log } = runPromoteLatest({ mode: 'latest-ahead', dryRun: true });

  assert.equal(result.status, 1, `expected exit code 1, got ${result.status}\n${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /latest tag 9\.9\.9 is ahead of/);
  assert.doesNotMatch(log, /^dist-tag\|/m);
});

test('promote-latest fails when target version is missing on npm', () => {
  const { result, log } = runPromoteLatest({ mode: 'missing-version', dryRun: true });

  assert.equal(result.status, 1, `expected exit code 1, got ${result.status}\n${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, new RegExp(`@zenithbuild/core@${TRAIN_VERSION.replaceAll('.', '\\.')} is not published on npm`));
  assert.doesNotMatch(log, /^dist-tag\|/m);
});

test('promote-latest fails when the train dist-tag does not match TRAIN_VERSION', () => {
  const { result, log } = runPromoteLatest({ mode: 'train-mismatch', dryRun: true });

  assert.equal(result.status, 1, `expected exit code 1, got ${result.status}\n${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /train tag is 0\.6\.16, expected/);
  assert.doesNotMatch(log, /^dist-tag\|/m);
});
