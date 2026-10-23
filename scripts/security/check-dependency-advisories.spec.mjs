import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const checker = fileURLToPath(new URL('./check-dependency-advisories.mjs', import.meta.url));
const finding = '{"esbuild":[{"title":"Active esbuild advisory","severity":"moderate","url":"https://github.com/advisories/GHSA-67mh-4wv8-2f99"}]}';
// Fake `bun audit --json`: FAKE_ROOT / FAKE_SITE pick each scope's behavior.
const fakeBun = `#!/bin/sh
case "$(pwd -P)" in */site) mode="$FAKE_SITE" ;; *) mode="$FAKE_ROOT" ;; esac
case "$mode" in
  clean) printf '{}'; exit 0 ;;
  finding) printf '%s' '${finding}'; exit 1 ;;
  registry) printf 'error: GET https://registry.npmjs.org failed: ECONNRESET' >&2; exit 1 ;;
  badjson) printf 'not json'; exit 0 ;;
esac
exit 3
`;

function run(env, withBun = true) {
    const dir = mkdtempSync(join(tmpdir(), 'zenith-audit-'));
    try {
        if (withBun) {
            writeFileSync(join(dir, 'bun'), fakeBun);
            chmodSync(join(dir, 'bun'), 0o755);
        }
        return spawnSync(process.execPath, [checker], { encoding: 'utf8', env: { PATH: dir, ...env } });
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

test('checker exit codes separate clean, findings and audit errors', { skip: process.platform === 'win32' }, () => {
    for (const [root, site, code] of [
        ['clean', 'clean', 0],
        ['finding', 'clean', 1],
        ['clean', 'registry', 2],
        ['badjson', 'clean', 2],
        ['finding', 'registry', 2],
        ['clean', 'crash', 2]
    ]) {
        const result = run({ FAKE_ROOT: root, FAKE_SITE: site });
        assert.equal(result.status, code, `${root}/${site}: ${result.stderr}`);
        if (code === 2) assert.match(result.stderr, /audit could not run, not an advisory finding/);
        if (code === 1) assert.match(result.stderr, /Exit 1: 1 active finding/);
    }
});

test('a missing bun is an audit error, not a finding', { skip: process.platform === 'win32' }, () => {
    const result = run({}, false);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /ENOENT/);
});
