import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts/file-size-audit.mjs');

function makeTempRoot() {
  return mkdtempSync(path.join(tmpdir(), 'zenith-file-size-audit-'));
}

function writeAllowlist(root, entries = []) {
  const allowlistPath = path.join(root, 'allowlist.json');
  writeFileSync(
    allowlistPath,
    JSON.stringify({
      version: 1,
      policy: {
        preferredMaxLines: 500,
        warningBandMaxLines: 800,
        defaultSplitBandMaxLines: 1200,
        immediateSplitMinLines: 1201
      },
      allowlist: entries
    }),
    'utf8'
  );
  return allowlistPath;
}

function writeLargeSource(root, relPath, lineCount = 550) {
  const filePath = path.join(root, relPath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(
    filePath,
    Array.from({ length: lineCount }, (_, index) => `export const value${index} = ${index};`).join('\n'),
    'utf8'
  );
}

function runAudit(root, allowlistPath) {
  return spawnSync(
    process.execPath,
    [
      SCRIPT,
      '--allowlist',
      allowlistPath,
      '--enforce',
      '--max-lines',
      '500',
      '--print-limit',
      '20'
    ],
    {
      cwd: root,
      encoding: 'utf8'
    }
  );
}

test('archived bundler legacy snapshots are ignored by file-size audit', () => {
  const root = makeTempRoot();
  try {
    writeLargeSource(root, 'packages/bundler/_legacy_v1/src/spa-build.ts');
    const result = runAudit(root, writeAllowlist(root));

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /enforcement passed/);
    assert.doesNotMatch(result.stdout, /spa-build\.ts/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('generated language package output is ignored by file-size audit', () => {
  const root = makeTempRoot();
  try {
    writeLargeSource(root, 'packages/language/out/server.mjs');
    const result = runAudit(root, writeAllowlist(root));

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /enforcement passed/);
    assert.doesNotMatch(result.stdout, /server\.mjs/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('large golden fixtures require explicit allowlist coverage', () => {
  const root = makeTempRoot();
  const goldenPath = 'packages/router/tests/fixtures/router-template.golden.js';
  try {
    writeLargeSource(root, goldenPath);
    const blocked = runAudit(root, writeAllowlist(root));

    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stdout, /router-template\.golden\.js/);
    assert.match(blocked.stdout, /not-allowlisted/);

    const allowed = runAudit(
      root,
      writeAllowlist(root, [
        {
          path: goldenPath,
          maxLines: 1500,
          reason: '#79 full-template golden fixture retained for byte-level router contract coverage'
        }
      ])
    );

    assert.equal(allowed.status, 0, allowed.stderr || allowed.stdout);
    assert.match(allowed.stdout, /allowlisted-over-limit=1/);
    assert.match(allowed.stdout, /enforcement passed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('normal oversized source files still fail enforcement', () => {
  const root = makeTempRoot();
  try {
    writeLargeSource(root, 'packages/app/src/large.js');
    const result = runAudit(root, writeAllowlist(root));

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /packages\/app\/src\/large\.js/);
    assert.match(result.stdout, /not-allowlisted/);
    assert.match(result.stderr, /enforcement failed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
