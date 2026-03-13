
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CWD = process.cwd();
const CLI_BIN = [
    join(CWD, 'target/release/zenith-bundler'),
    join(CWD, 'target/debug/zenith-bundler'),
    join(CWD, '../zenith-bundler/target/release/zenith-bundler'),
    join(CWD, '../zenith-bundler/target/debug/zenith-bundler')
].find((candidate) => existsSync(candidate)) || join(CWD, 'target/release/zenith-bundler');
const TEST_DIR = join(CWD, 'tests/tmp_manifest_contract');

function cleanup() {
    if (existsSync(TEST_DIR)) {
        rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
}

function runBundler(payload, cwd = TEST_DIR) {
    const res = spawnSync(CLI_BIN, ['--out-dir', 'dist'], {
        input: JSON.stringify(payload),
        cwd,
        encoding: 'utf8'
    });
    if (res.status !== 0) {
        console.error('Bundler Failed:');
        console.error('STDOUT:', res.stdout);
        console.error('STDERR:', res.stderr);
    }
    return res;
}

const PAGE_A = {
    ir: {
        ir_version: 1,
        graph_hash: "64d2dd5787572845305bb40813a7ab2bd93560ebc6ea3d6e19f92cb392d616ee",
        graph_nodes: [{ id: "mod_a", hoist_id: "mod_a" }],
        graph_edges: [],
        html: "<!DOCTYPE html><html><head><!-- ZENITH_STYLES_ANCHOR --></head><body>A</body></html>",
        expressions: [],
        marker_bindings: [],
        event_bindings: [],
        signals: [],
        expression_bindings: [],
        style_blocks: [],
        hoisted: { code: [], state: [] },
        components_scripts: {},
        component_instances: [],
        prerender: false
    },
    route: "/a",
    file: "pages/a.zen",
    router: true
};

const PAGE_B = {
    ...PAGE_A,
    ir: {
        ...PAGE_A.ir,
        html: "<!DOCTYPE html><html><head><!-- ZENITH_STYLES_ANCHOR --></head><body>B</body></html>",
        graph_nodes: [{ id: "mod_b", hoist_id: "mod_b" }],
        graph_hash: "bf21feaacb3b4e8db3e28d8d40e01cfaa5ac85221674d03c97e332c4684fd7eb"
    },
    route: "/b",
    file: "pages/b.zen"
};

const PAGE_VENDOR = {
    ...PAGE_A,
    ir: {
        ...PAGE_A.ir,
        imports: [{ local: "gsap", spec: "gsap", hoist_id: "h_gsap", file_hash: "f_gsap" }]
    },
    route: "/vendor",
    file: "pages/vendor.zen"
};

test('Manifest Contract & Batch Determinism', async (t) => {
    cleanup();

    // 1. Determinism (Byte-for-Byte)
    await t.test('Determinism: Indentical Inputs -> Identical Outputs', () => {
        cleanup();
        const payload = [PAGE_A, PAGE_B];

        // Build 1
        const res1 = runBundler(payload);
        assert.strictEqual(res1.status, 0, 'Build 1 failed');
        const m1 = readFileSync(join(TEST_DIR, 'dist/manifest.json'), 'utf8');

        // Build 2
        rmSync(join(TEST_DIR, 'dist'), { recursive: true });
        const res2 = runBundler(payload);
        assert.strictEqual(res2.status, 0, 'Build 2 failed');
        const m2 = readFileSync(join(TEST_DIR, 'dist/manifest.json'), 'utf8');

        assert.strictEqual(m1, m2, 'Manifests are not byte-for-byte identical');
    });

    // 2. Cross-Page Stability (Order Independence)
    await t.test('Cross-Page Stability: [A, B] vs [B, A] -> Identical Hash', () => {
        cleanup();

        // Order 1: [A, B]
        runBundler([PAGE_A, PAGE_B]);
        const m1 = JSON.parse(readFileSync(join(TEST_DIR, 'dist/manifest.json'), 'utf8'));

        // Order 2: [B, A]
        rmSync(join(TEST_DIR, 'dist'), { recursive: true });
        runBundler([PAGE_B, PAGE_A]);
        const m2 = JSON.parse(readFileSync(join(TEST_DIR, 'dist/manifest.json'), 'utf8'));

        assert.deepStrictEqual(m1, m2, 'Manifest content differs based on input order');
    });

    // 3. Router Hash Sensitivity
    await t.test('Router Hash Sensitivity: Router Hash changes on Manifest Change', () => {
        cleanup();

        // Baseline
        runBundler([PAGE_A]);
        const m1 = JSON.parse(readFileSync(join(TEST_DIR, 'dist/manifest.json'), 'utf8'));
        const routerHash1 = m1.router.match(/router\.([a-f0-9]+)\.js/)[1];

        // Change Page A -> Manifest Change -> Router Hash Change
        cleanup();
        const MOD_A = { ...PAGE_A, route: "/changed" };
        runBundler([MOD_A]);
        const m2 = JSON.parse(readFileSync(join(TEST_DIR, 'dist/manifest.json'), 'utf8'));
        const routerHash2 = m2.router.match(/router\.([a-f0-9]+)\.js/)[1];

        assert.notStrictEqual(routerHash1, routerHash2, 'Router hash did not change when manifest changed');
    });

    // 4. Atomic Write (Partial Failure Simulation)
    // NOTE: Hard to simulate process crash inside test without mocking.
    // Instead we check strictly that dist_tmp does not exist after success.
    await t.test('Atomic Write: Clean cleanup', () => {
        cleanup();
        runBundler([PAGE_A]);

        assert.ok(existsSync(join(TEST_DIR, 'dist/manifest.json')), 'dist/manifest.json missing');
        assert.ok(!existsSync(join(TEST_DIR, 'dist_tmp')), 'dist_tmp should be removed');
    });

    await t.test('Vendor Field: present when external bare specifiers exist', () => {
        cleanup();

        const nodeModules = join(TEST_DIR, 'node_modules');
        mkdirSync(join(nodeModules, 'gsap'), { recursive: true });
        writeFileSync(join(nodeModules, 'gsap', 'package.json'), '{"name":"gsap","main":"index.js","type":"module"}');
        writeFileSync(join(nodeModules, 'gsap', 'index.js'), 'export const gsap = { version: "mock" };');
        writeFileSync(join(TEST_DIR, 'package.json'), '{"name":"test-project","dependencies":{"gsap":"1.0.0"}}');
        writeFileSync(join(TEST_DIR, 'package-lock.json'), '{"name":"test-project","lockfileVersion":3,"packages":{"":{"dependencies":{"gsap":"1.0.0"}}}}');

        const res = runBundler([PAGE_VENDOR]);
        assert.strictEqual(res.status, 0, 'Bundler should succeed for neutral third-party ESM imports');

        const manifest = JSON.parse(readFileSync(join(TEST_DIR, 'dist/manifest.json'), 'utf8'));
        assert.match(manifest.vendor, /^\/assets\/vendor\.[a-f0-9]+\.js$/, 'manifest.vendor must be deterministic asset path');
    });

    cleanup();
});
