
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CWD = process.cwd();
const CLI_BIN = [
    join(CWD, '../zenith-bundler/target/debug/zenith-bundler'),
    join(CWD, '../zenith-bundler/target/release/zenith-bundler')
].find((candidate) => existsSync(candidate)) || join(CWD, '../zenith-bundler/target/debug/zenith-bundler');
const TEST_DIR = join(CWD, 'tests/tmp_vendor_emission');

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
        encoding: 'utf8',
        env: { ...process.env, RUST_BACKTRACE: '1' }
    });
    if (res.status !== 0) {
        console.error('Bundler Failed:');
        console.error('STDOUT:', res.stdout);
        console.error('STDERR:', res.stderr);
    }
    return res;
}

const PAGE_EXTERNAL = {
    ir: {
        ir_version: 1,
        graph_hash: "598ae74fdb6ab87d7e19b847c8a0930fe6a6beca8b16f43080eb1e6d91752795",
        graph_nodes: [{ id: "mod_external", hoist_id: "mod_external" }],
        graph_edges: [],
        html: "<html><head><!-- ZENITH_STYLES_ANCHOR --></head><body></body></html>",
        expressions: [],
        marker_bindings: [],
        event_bindings: [],
        signals: [],
        expression_bindings: [],
        style_blocks: [],
        hoisted: { code: [], state: [], imports: [] },
        components_scripts: {
            "cmp_banner": {
                hoist_id: "cmp_banner",
                module_id: "components/Banner.zen:script",
                factory: "createBanner",
                imports: ["import { animate } from '../helpers/anim.js';"],
                deps: [],
                code: "export default function Banner() { animate(); return null; }"
            }
        },
        component_instances: [],
        prerender: false,
        imports: [],
        modules: [
            {
                id: "helpers/anim.js",
                source: "import { gsap } from 'gsap'; export { format } from 'date-fns'; export async function load() { return import('gsap'); } export function animate() { return gsap; }",
                deps: []
            }
        ]
    },
    route: "/external",
    file: "pages/external.zen",
    router: true
};

const PAGE_FRAMEWORK = {
    ...PAGE_EXTERNAL,
    ir: {
        ...PAGE_EXTERNAL.ir,
        imports: [{ local: "React", spec: "react", hoist_id: "h_react", file_hash: "f_react" }],
        components_scripts: {},
        modules: []
    },
    route: "/framework",
    file: "pages/framework.zen"
};

function collectImportSpecifiers(source) {
    const staticImportRe = /\bimport\s+(?:[^'"\n;]*?\s+from\s+)?['"]([^'"]+)['"]/g;
    const dynamicImportRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    const exportFromRe = /\bexport\s+[^'"\n;]*?\s+from\s+['"]([^'"]+)['"]/g;
    const out = new Set();
    for (const re of [staticImportRe, dynamicImportRe, exportFromRe]) {
        re.lastIndex = 0;
        let match;
        while ((match = re.exec(source)) !== null) {
            out.add(match[1]);
        }
    }
    return out;
}

function listJsFilesRecursive(dir) {
    const out = [];
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const abs = join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...listJsFilesRecursive(abs));
            continue;
        }
        if (entry.name.endsWith('.js')) {
            out.push(abs);
        }
    }
    return out;
}

test('Vendor Emission Verification', async (t) => {
    cleanup();

    await t.test('Emits vendor chunk for external imports', () => {
        cleanup();
        const payload = [PAGE_EXTERNAL];

        // Mock third-party ESM libraries in local node_modules.
        const nodeModules = join(TEST_DIR, 'node_modules');
        mkdirSync(join(nodeModules, 'gsap'), { recursive: true });
        writeFileSync(join(nodeModules, 'gsap', 'package.json'), '{"name":"gsap","main":"index.js","type":"module"}');
        writeFileSync(join(nodeModules, 'gsap', 'index.js'), 'export const gsap = { version: "mock" };');

        mkdirSync(join(nodeModules, 'date-fns'), { recursive: true });
        writeFileSync(join(nodeModules, 'date-fns', 'package.json'), '{"name":"date-fns","main":"index.js","type":"module"}');
        writeFileSync(join(nodeModules, 'date-fns', 'index.js'), 'export const format = () => "mock-date";');

        // package-lock is part of the vendor hash contract seed.
        writeFileSync(join(TEST_DIR, 'package.json'), '{"name":"test-project","dependencies":{"gsap":"1.0.0","date-fns":"1.0.0"}}');
        writeFileSync(join(TEST_DIR, 'package-lock.json'), '{"name":"test-project","lockfileVersion":3,"packages":{"":{"dependencies":{"gsap":"1.0.0","date-fns":"1.0.0"}}}}');

        const res = runBundler(payload);
        assert.equal(res.status, 0, 'Bundler should succeed');

        const manifestPath = join(TEST_DIR, 'dist/manifest.json');
        assert.ok(existsSync(manifestPath), 'Manifest should exist');
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

        assert.ok(manifest.vendor, 'Manifest should have vendor field');
        assert.match(manifest.vendor, /assets\/vendor\.[a-f0-9]+\.js/, 'Vendor path should match pattern');

        const vendorPathRel = manifest.vendor.replace(/^\//, ''); // remove leading slash
        const vendorPath = join(TEST_DIR, 'dist', vendorPathRel);
        assert.ok(existsSync(vendorPath), `Vendor file should exist at ${vendorPath}`);

        const distAssets = join(TEST_DIR, 'dist/assets');
        const jsFiles = listJsFilesRecursive(distAssets);
        assert.ok(jsFiles.length > 0, 'Dist assets should include JS files');

        let foundVendorImportRewrite = false;
        for (const file of jsFiles) {
            const source = readFileSync(file, 'utf8');
            const specs = collectImportSpecifiers(source);
            for (const spec of specs) {
                assert.notEqual(spec, 'gsap', `bare gsap import leaked in ${file}`);
                assert.notEqual(spec, 'date-fns', `bare date-fns import leaked in ${file}`);
                if (spec === manifest.vendor) {
                    foundVendorImportRewrite = true;
                }
            }
        }
        assert.ok(foundVendorImportRewrite, 'Expected at least one rewritten import to target manifest.vendor');
    });

    await t.test('Framework interop imports hard-fail with contract diagnostic', () => {
        cleanup();
        writeFileSync(join(TEST_DIR, 'package.json'), '{"name":"test-project","dependencies":{"react":"1.0.0"}}');
        writeFileSync(join(TEST_DIR, 'package-lock.json'), '{"name":"test-project","lockfileVersion":3,"packages":{"":{"dependencies":{"react":"1.0.0"}}}}');

        const res = runBundler([PAGE_FRAMEWORK]);
        assert.notEqual(res.status, 0, 'Bundler must fail on framework interop imports');
        assert.match(
            res.stderr,
            /Framework interop imports are not supported yet\. If you want this, we need an explicit adapter\/islands layer\./,
            'error must explain framework interop policy gate'
        );
        assert.match(res.stderr, /blocked_specifiers: react/, 'error must include blocked specifier');
    });
});
