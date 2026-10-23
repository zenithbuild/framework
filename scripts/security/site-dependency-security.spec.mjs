import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const siteRequire = createRequire(resolve(root, 'site/package.json'));
const sanitize = siteRequire('sanitize-html');

test('discarded iframe fallback cannot exhaust the sanitizer stack', () => {
  assert.doesNotThrow(() => sanitize('<iframe>'.repeat(20_000)));
  const input = ('<iframe>' + '<b>'.repeat(3)).repeat(50) + 'content';
  const html = sanitize(input, { allowedTags: ['b'], nestingLimit: 3 });
  let depth = 0;
  for (const tag of html.match(/<\/?b>/g) || []) {
    depth += tag === '<b>' ? 1 : -1;
    assert.ok(depth <= 3, 'discarded iframes must not restart nestingLimit');
  }
});

test('ordinary sanitized content and safe links retain their behavior', () => {
  assert.equal(
    sanitize('<p>Hello <strong>world</strong><script>alert(1)</script></p>'),
    '<p>Hello <strong>world</strong></p>',
  );
  assert.equal(sanitize('<a href="https://example.test/docs">Docs</a>'),
    '<a href="https://example.test/docs">Docs</a>');
  assert.equal(sanitize('<a href="javascript:alert(1)">Unsafe</a>'), '<a>Unsafe</a>');
});

function runAuditStep(outputs) {
  const workflow = readFileSync(resolve(root, '.github/workflows/validate-site-dependencies.yml'), 'utf8');
  const lines = workflow.split('\n');
  const start = lines.indexOf('      - name: Keep every active root and site advisory blocking');
  const body = lines.indexOf('        run: |', start);
  assert.ok(start >= 0 && body > start, 'the audit gate step must exist');
  const script = [];
  for (const line of lines.slice(body + 1)) {
    if (line.trim() && !line.startsWith('          ')) break;
    script.push(line.slice(10));
  }
  const directory = mkdtempSync(resolve(tmpdir(), 'jud21-audit-'));
  try {
    mkdirSync(resolve(directory, 'site'));
    mkdirSync(resolve(directory, 'bin'));
    const stub = resolve(directory, 'bin/bun');
    writeFileSync(stub, '#!/usr/bin/env bash\nscope=root; [ "$(basename "$PWD")" = site ] && scope=site\n'
      + 'cat "$STUB_DIR/$scope.out"; exit "$(cat "$STUB_DIR/$scope.status")"\n');
    chmodSync(stub, 0o755);
    for (const [scope, [stdout, status]] of Object.entries(outputs)) {
      writeFileSync(resolve(directory, `${scope}.out`), stdout);
      writeFileSync(resolve(directory, `${scope}.status`), String(status));
    }
    return spawnSync('bash', ['-eo', 'pipefail', '-c', script.join('\n')], {
      cwd: directory, encoding: 'utf8',
      env: { ...process.env, PATH: `${resolve(directory, 'bin')}:${process.env.PATH}`, STUB_DIR: directory },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const finding = JSON.stringify({ braces: [{ severity: 'high', url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm' }] });

test('empty or unparseable audit output is an audit error, never clean', () => {
  for (const bad of [['', 0], ['not JSON', 0], ['[]', 0], ['{}', 1], ['', 1], [finding, 3]]) {
    const result = runAuditStep({ root: ['{}', 0], site: bad });
    assert.equal(result.status, 2, `site ${JSON.stringify(bad)}: ${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /::error::site bun audit exited \d+ without a usable JSON report/);
  }
});

test('audit findings, clean reports and errors keep distinct exit codes', () => {
  assert.equal(runAuditStep({ root: ['{}', 0], site: ['{}', 0] }).status, 0);
  assert.equal(runAuditStep({ root: [finding, 1], site: ['{}', 0] }).status, 1);
  assert.equal(runAuditStep({ root: ['{}', 0], site: [finding, 0] }).status, 1, 'findings count even on exit 0');
  assert.equal(runAuditStep({ root: [finding, 1], site: ['', 0] }).status, 2, 'an audit error wins over findings');
  assert.equal(runAuditStep({ root: ['', 0], site: [finding, 1] }).status, 2, 'a later finding cannot mask an error');
});
