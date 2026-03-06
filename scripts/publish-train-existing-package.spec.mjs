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
    'const args = process.argv.slice(2);',
    'const command = args[0] || "";',
    'const target = args[1] || "";',
    'const field = args[2] || "";',
    `const packageName = ${JSON.stringify(PACKAGE_NAME)};`,
    `const currentVersion = ${JSON.stringify(TRAIN_VERSION)};`,
    'if (command === "view") {',
    '  if (target === `${packageName}@${currentVersion}` && field === "dist-tags") {',
    '    process.stderr.write("npm error code E404\\nnpm error 404 Not Found - GET https://registry.npmjs.org/pkg - Not found\\n");',
    '    process.exit(1);',
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
    '    process.stdout.write(JSON.stringify({ latest: "0.6.13", train: "0.6.13" }));',
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

test('publish-train publishes an existing package when npm view version returns a JSON string', () => {
  const tempDir = makeTempDir('zenith-publish-train-existing-');
  const fakeNpm = createFakeNpm(tempDir);

  try {
    const result = spawnSync('bash', ['./scripts/publish-train.sh'], {
      cwd: ROOT,
      env: {
        ...process.env,
        NPM_BIN: fakeNpm,
        PUBLISH_PACKAGE_FILTER: PACKAGE_DIR
      },
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, `expected exit code 0, got ${result.status}\n${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, new RegExp(`Checking ${PACKAGE_NAME}@${TRAIN_VERSION.replaceAll('.', '\\.')}`));
    assert.match(result.stdout, /published/);
    assert.doesNotMatch(result.stderr, /Bootstrap required:/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
