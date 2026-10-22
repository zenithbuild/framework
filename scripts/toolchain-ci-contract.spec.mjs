import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const workflows = readdirSync(new URL('.github/workflows/', root)).filter(name => name.endsWith('.yml'));

test('every workflow uses the same exact toolchain and frozen installs', () => {
    for (const name of workflows) {
        const source = read(`.github/workflows/${name}`);
        for (const match of source.matchAll(/node-version:\s*([^\n]+)/g)) {
            assert.equal(match[1].replaceAll('"', '').trim(), '24.19.0', name);
        }
        for (const match of source.matchAll(/bun-version:\s*([^\n]+)/g)) {
            assert.equal(match[1].replaceAll('"', '').trim(), '1.4.0', name);
        }
        for (const match of source.matchAll(/dtolnay\/rust-toolchain@([^\s]+)/g)) {
            assert.equal(match[1], '1.97.1', name);
        }
        assert.doesNotMatch(source, /bun install(?! --frozen-lockfile)/, name);
        assert.doesNotMatch(source, /cargo build(?! --locked)/, name);
    }
    assert.equal(JSON.parse(read('package.json')).packageManager, 'bun@1.4.0');
    assert.equal(read('.node-version').trim(), '24.19.0');
    assert.match(read('rust-toolchain.toml'), /channel = "1\.97\.1"/);
});

test('both PR gates include integration/v1 and all existing branch targets', () => {
    for (const name of ['ci.yml', 'validate-native-consumers.yml']) {
        const source = read(`.github/workflows/${name}`);
        const trigger = source.split('  pull_request:')[1]?.split(/\n(?:  \w+:|\w+:)/)[0];
        assert.ok(trigger, `${name}: pull_request trigger is required`);
        for (const branch of ['master', 'train', 'beta', 'integration/v1']) {
            assert.ok(trigger.includes(branch), `${name}: missing PR target ${branch}`);
        }
        assert.match(source, /contents: read/);
        assert.doesNotMatch(source, /(?:contents|id-token): write/);
        assert.doesNotMatch(source, /pull_request_target/);
    }
});

test('standard builds validate tools before building and lock native dependencies', () => {
    const build = read('scripts/build.sh');
    assert.ok(build.indexOf('node ./scripts/check-toolchain.mjs') < build.indexOf('bun run'));
    assert.match(build, /cargo build --locked --release/);
    assert.match(JSON.parse(read('packages/bundler/package.json')).scripts.build, /cargo build --locked --release/);
});

test('Cargo caches never traverse workspace dependency links or restore legacy archives', () => {
    const source = read('.github/workflows/reusable-ci.yml');
    const blocks = [...source.matchAll(/- name: Cache Cargo registry and build outputs([\s\S]*?)(?=\n      -)/g)];
    assert.equal(blocks.length, 3, 'core, integration and smoke must use the safe cache');
    for (const [, block] of blocks) {
        assert.doesNotMatch(block, /packages\/\*\*\/target/);
        assert.match(block, /packages\/compiler\/target/);
        assert.match(block, /packages\/bundler\/target/);
        assert.match(block, /key: \$\{\{ runner.os \}\}-cargo-1\.97\.1-v2-/);
        assert.match(block, /restore-keys: \|\s*\$\{\{ runner.os \}\}-cargo-1\.97\.1-v2-\s*$/);
    }
});
