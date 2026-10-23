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

const LOCAL = { CI: undefined, GITHUB_ACTIONS: undefined };
const CI = { CI: 'true', GITHUB_ACTIONS: undefined };

function run(versions, mode = LOCAL) {
    const env = { ...process.env, ...mode, ZENITH_TEST_VERSIONS: JSON.stringify(versions) };
    for (const key of Object.keys(env)) if (env[key] === undefined) delete env[key];
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
            env
        });
    } finally {
        rmSync(scratch, { recursive: true, force: true });
    }
}

for (const [label, mode, name] of [['local', LOCAL, 'patch-tolerant'], ['CI', CI, 'exact']]) {
    test(`accepts the exact selected toolchain (${label})`, () => {
        const result = run(pins, mode);
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /Node 24\.19\.0, Bun 1\.4\.0, Rust\/Cargo 1\.97\.1/);
        assert.ok(result.stdout.includes(`Mode: ${name}`), result.stdout);
    });
}

const newerPatch = { ...pins, node: '24.19.3', rustc: '1.97.2', cargo: '1.97.2' };

test('local mode accepts newer Node and Rust patches and names found and pinned versions', () => {
    const result = run(newerPatch);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Mode: patch-tolerant \(local\)/);
    assert.match(result.stdout, /Node 24\.19\.3 \(pinned 24\.19\.0, newer patch\)/);
    assert.match(result.stdout, /Rust 1\.97\.2 \(pinned 1\.97\.1, newer patch\)/);
    assert.match(result.stdout, /Cargo 1\.97\.2 \(pinned 1\.97\.1, newer patch\)/);
});

test('CI and GITHUB_ACTIONS keep newer patches exact', () => {
    for (const mode of [CI, { CI: undefined, GITHUB_ACTIONS: 'true' }]) {
        const result = run(newerPatch, mode);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /Mode: exact \(CI\)/);
        assert.match(result.stderr, /Node: expected 24\.19\.0, found 24\.19\.3 \(needs exactly 24\.19\.0\)/);
        assert.match(result.stderr, /Rust: expected 1\.97\.1, found 1\.97\.2/);
    }
});

test('CI=false counts as local', () => {
    const result = run(newerPatch, { CI: 'false', GITHUB_ACTIONS: undefined });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Mode: patch-tolerant/);
});

test('Bun stays exact even locally', () => {
    const result = run({ ...pins, bun: '1.4.2' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Mode: patch-tolerant \(local\)/);
    assert.match(result.stderr, /Bun: expected 1\.4\.0, found 1\.4\.2 \(needs exactly 1\.4\.0\)/);
    assert.doesNotMatch(result.stderr, /Node:|Rust:|Cargo:/);
});

test('local mode rejects older patches', () => {
    const result = run({ ...pins, rustc: '1.97.0', cargo: '1.97.0' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Rust: expected 1\.97\.1, found 1\.97\.0 \(needs 1\.97\.x with x >= 1\)/);
    assert.match(result.stderr, /Cargo: expected 1\.97\.1, found 1\.97\.0/);
    const pinnedPatch = Number(pins.node.split('.')[2]);
    if (pinnedPatch > 0) {
        const older = run({ ...pins, node: pins.node.replace(/\d+$/, String(pinnedPatch - 1)) });
        assert.match(older.stderr, /Node: expected/);
    }
});

test('local mode rejects minor and major mismatches', () => {
    const result = run({ ...pins, node: '24.20.0', rustc: '1.98.0', cargo: '2.97.1' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Node: expected 24\.19\.0, found 24\.20\.0 \(needs 24\.19\.x with x >= 0\)/);
    assert.match(result.stderr, /Rust: expected 1\.97\.1, found 1\.98\.0/);
    assert.match(result.stderr, /Cargo: expected 1\.97\.1, found 2\.97\.1/);
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
