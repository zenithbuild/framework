import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const TRAIN_VERSION = readFileSync(path.join(ROOT, 'TRAIN_VERSION'), 'utf8').trim();
const PACKAGE_DIR = 'packages/compiler-linux-x64';
const PACKAGE_NAME = '@zenithbuild/compiler-linux-x64';

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
    'const npmTag = process.env.npm_config_tag || process.env.NPM_CONFIG_TAG || "";',
    'const mode = process.env.FAKE_NPM_MODE || "already-published";',
    'const logPath = process.env.FAKE_NPM_LOG || "";',
    'if (logPath) {',
    '  fs.appendFileSync(logPath, `${command}|${target}|${field}|tag=${npmTag}\\n`);',
    '}',
    `const packageName = ${JSON.stringify(PACKAGE_NAME)};`,
    `const currentVersion = ${JSON.stringify(TRAIN_VERSION)};`,
    'function notFound(message) {',
    '  process.stderr.write(message);',
    '  process.exit(1);',
    '}',
    'if (command === "view") {',
    '  if (npmTag && npmTag !== "latest" && target.startsWith(packageName)) {',
    '    notFound("npm error code E404\\nnpm error 404 No match found for version train\\n");',
    '  }',
    '  if (mode === "name-missing" && target.startsWith(packageName)) {',
    '    notFound("npm error code E404\\nnpm error 404 Not Found - GET https://registry.npmjs.org/pkg - Not found\\n");',
    '  }',
    '  if (target === `${packageName}@${currentVersion}` && field === "version") {',
    '    if (mode === "version-missing") {',
    '      notFound("npm error code E404\\nnpm error 404 Not Found - GET https://registry.npmjs.org/pkg - Not found\\n");',
    '    }',
    '    process.stdout.write(JSON.stringify(currentVersion));',
    '    process.exit(0);',
    '  }',
    '  if (target === packageName && field === "version") {',
    '    process.stdout.write(JSON.stringify("0.6.13"));',
    '    process.exit(0);',
    '  }',
    '  if (target === packageName && field === "versions") {',
    '    process.stdout.write(JSON.stringify(["0.6.13"]));',
    '    process.exit(0);',
    '  }',
    '  if (target === packageName && field === "dist-tags") {',
    '    process.stdout.write(JSON.stringify({ latest: "0.6.13" }));',
    '    process.exit(0);',
    '  }',
    '  process.stderr.write(`unexpected view target: ${target} ${field}\\n`);',
    '  process.exit(98);',
    '}',
    'if (command === "publish") {',
    '  process.stdout.write(`published ${target || packageName}\\n`);',
    '  process.exit(0);',
    '}',
    'process.stderr.write(`unexpected fake npm command: ${args.join(" ")}\\n`);',
    'process.exit(97);'
  ].join('\n');

  writeFileSync(scriptPath, script, 'utf8');
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

function runPublishTrain({ mode, dryRun = false }) {
  const tempDir = makeTempDir('zenith-publish-train-existing-');
  const fakeNpm = createFakeNpm(tempDir);
  const logPath = path.join(tempDir, 'fake-npm.log');

  try {
    const args = dryRun ? ['./scripts/publish-train.sh', '--dry-run'] : ['./scripts/publish-train.sh'];
    const result = spawnSync('bash', args, {
      cwd: ROOT,
      env: {
        ...process.env,
        NPM_BIN: fakeNpm,
        NPM_CONFIG_TAG: 'train',
        PUBLISH_PACKAGE_FILTER: PACKAGE_DIR,
        FAKE_NPM_MODE: mode,
        FAKE_NPM_LOG: logPath
      },
      encoding: 'utf8'
    });
    const log = readFileSync(logPath, 'utf8');
    return { result, log };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test('preflight ignores NPM_CONFIG_TAG and skips already published versions', () => {
  const { result, log } = runPublishTrain({ mode: 'already-published' });

  assert.equal(result.status, 0, `expected exit code 0, got ${result.status}\n${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, new RegExp(`Checking ${PACKAGE_NAME}@${TRAIN_VERSION.replaceAll('.', '\\.')}`));
  assert.match(result.stdout, /skip: already published/);
  assert.doesNotMatch(result.stdout, /bootstrap required: package name not yet published on npm/);
  assert.doesNotMatch(result.stderr, /Bootstrap required:/);
  assert.match(log, new RegExp(`view\\|${PACKAGE_NAME.replace('/', '\\/')}@${TRAIN_VERSION.replaceAll('.', '\\.')}\\|version\\|`));
  assert.doesNotMatch(log, new RegExp(`view\\|${PACKAGE_NAME.replace('/', '\\/')}@${TRAIN_VERSION.replaceAll('.', '\\.')}\\|dist-tags\\|`));
  assert.doesNotMatch(log, /^view\|.*\|tag=train$/m);
});

test('preflight classifies missing versions as publish-needed, not bootstrap-needed', () => {
  const { result, log } = runPublishTrain({ mode: 'version-missing' });

  assert.equal(result.status, 0, `expected exit code 0, got ${result.status}\n${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /published/);
  assert.doesNotMatch(result.stdout, /bootstrap required: package name not yet published on npm/);
  assert.doesNotMatch(result.stderr, /Bootstrap required:/);
  assert.match(log, new RegExp(`view\\|${PACKAGE_NAME.replace('/', '\\/')}\\|version\\|`));
  assert.match(log, new RegExp(`view\\|${PACKAGE_NAME.replace('/', '\\/')}@${TRAIN_VERSION.replaceAll('.', '\\.')}\\|version\\|`));
  assert.doesNotMatch(log, /^view\|.*\|tag=train$/m);
});

test('preflight still requires bootstrap when package name is missing', () => {
  const { result, log } = runPublishTrain({ mode: 'name-missing' });

  assert.equal(result.status, 1, `expected exit code 1, got ${result.status}\n${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /bootstrap required: package name not yet published on npm/);
  assert.match(result.stderr, /Bootstrap required: @zenithbuild\/compiler-linux-x64/);
  assert.doesNotMatch(log, /^view\|.*\|tag=train$/m);
});
