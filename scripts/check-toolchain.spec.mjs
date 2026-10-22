import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./check-toolchain.mjs', import.meta.url));
const expectedNode = readFileSync(new URL('../.node-version', import.meta.url), 'utf8').trim();
const pins = { node: expectedNode, bun: '1.4.0', rustc: '1.97.1', cargo: '1.97.1' };

function run(versions) {
    const scratch = mkdtempSync(join(tmpdir(), 'zenith-toolchain-check-'));
    const preload = join(scratch, 'versions.mjs');
    writeFileSync(preload, `
        import cp from 'node:child_process';
        import { syncBuiltinESMExports } from 'node:module';
        const versions = JSON.parse(process.env.ZENITH_TEST_VERSIONS);
        Object.defineProperty(process.versions, 'node', { value: versions.node });
        cp.spawnSync = (command) => versions[command] == null
            ? { status: null, error: new Error('missing command') }
            : { status: 0, stdout: command + ' ' + versions[command] };
        syncBuiltinESMExports();
    `);
    try {
        return spawnSync(process.execPath, ['--import', preload, script], {
            encoding: 'utf8',
            env: { ...process.env, ZENITH_TEST_VERSIONS: JSON.stringify(versions) }
        });
    } finally {
        rmSync(scratch, { recursive: true, force: true });
    }
}

test('accepts the exact selected toolchain', () => {
    const result = run(pins);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Node 24\.19\.0, Bun 1\.4\.0, Rust\/Cargo 1\.97\.1/);
});

test('old Node, Bun and Rust fail with actionable versions before dependency compilation', () => {
    const result = run({ ...pins, node: '20.20.2', bun: '1.3.14', rustc: '1.85.1' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Node: expected 24\.19\.0, found 20\.20\.2/);
    assert.match(result.stderr, /Bun: expected 1\.4\.0, found 1\.3\.14/);
    assert.match(result.stderr, /Rust: expected 1\.97\.1, found 1\.85\.1/);
});

test('missing tools and failed version probes cannot pass', () => {
    const result = run({ node: pins.node });
    assert.equal(result.status, 1);
    for (const tool of ['Bun', 'Rust', 'Cargo']) assert.ok(result.stderr.includes(`${tool}: expected`));
    assert.match(result.stderr, /unavailable/);
});
