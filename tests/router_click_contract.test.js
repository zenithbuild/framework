import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const CWD = process.cwd();
const TEST_DIR = join(CWD, 'tests/tmp_router_click_contract');

function resolveCliBin() {
    const candidates = [
        join(CWD, '../zenith-bundler/target/debug/zenith-bundler'),
        join(CWD, '../zenith-bundler/target/release/zenith-bundler')
    ];
    return candidates.find((candidate) => existsSync(candidate)) || candidates[0];
}

const CLI_BIN = resolveCliBin();

function cleanup() {
    if (existsSync(TEST_DIR)) {
        rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
}

function runBundler(payload) {
    const res = spawnSync(CLI_BIN, ['--out-dir', 'dist'], {
        input: JSON.stringify(payload),
        cwd: TEST_DIR,
        encoding: 'utf8'
    });
    if (res.status !== 0) {
        console.error('Bundler Failed');
        console.error('STDOUT:', res.stdout);
        console.error('STDERR:', res.stderr);
    }
    return res;
}

function baseIr(html, nodeId, graphHash) {
    return {
        ir_version: 1,
        graph_hash: graphHash,
        graph_nodes: [{ id: nodeId, hoist_id: nodeId }],
        graph_edges: [],
        html,
        expressions: [],
        marker_bindings: [],
        event_bindings: [],
        signals: [],
        expression_bindings: [],
        style_blocks: [],
        hoisted: { code: [], state: [] },
        components_scripts: {},
        component_instances: [],
        imports: [],
        modules: [],
        prerender: false
    };
}

test('router click contract uses single-click push+navigate flow', async () => {
    cleanup();

    const payload = [
        {
            route: '/',
            file: 'pages/index.zen',
            router: true,
            ir: baseIr(
                '<!DOCTYPE html><html><head><!-- ZENITH_STYLES_ANCHOR --></head><body><main>Home</main></body></html>',
                'mod_home',
                '14e6e24af0adb2103ad152405e46035b6ec731b2dd34c53e6798265c9e11e540'
            )
        },
        {
            route: '/about',
            file: 'pages/about.zen',
            router: true,
            ir: baseIr(
                '<!DOCTYPE html><html><head><!-- ZENITH_STYLES_ANCHOR --></head><body><main>Move certainty upstream.</main></body></html>',
                'mod_about',
                '1a2a8bf9e5006d0723907012ab8100a50ad8859343f4f4df1a59a4405c84c184'
            )
        }
    ];

    const res = runBundler(payload);
    assert.strictEqual(res.status, 0, 'bundler should succeed');

    const manifest = JSON.parse(readFileSync(join(TEST_DIR, 'dist/manifest.json'), 'utf8'));
    assert.ok(manifest.router, 'manifest.router should exist');
    const routerAsset = join(TEST_DIR, 'dist', manifest.router.replace(/^\//, ''));
    assert.ok(existsSync(routerAsset), 'router bundle should be emitted');
    const routerSource = readFileSync(routerAsset, 'utf8');

    const clickStart = routerSource.indexOf("document.addEventListener('click'");
    assert.ok(clickStart >= 0, 'router must attach delegated click handler');
    const preventDefaultIdx = routerSource.indexOf('event.preventDefault();', clickStart);
    const targetIdx = routerSource.indexOf("closest('a[data-zen-link]')", clickStart);
    const assignIdx = routerSource.indexOf('window.location.assign(url.href)', clickStart);
    const pushStateIdx = routerSource.indexOf('pushState(');
    const replaceStateIdx = routerSource.indexOf('replaceState(');
    assert.ok(preventDefaultIdx >= 0, 'click flow must call preventDefault');
    assert.ok(targetIdx >= 0, 'click flow must target a[data-zen-link]');
    assert.ok(assignIdx >= 0, 'click flow must call window.location.assign(url.href)');
    assert.strictEqual(pushStateIdx, -1, 'router runtime must not call pushState');
    assert.strictEqual(replaceStateIdx, -1, 'router runtime must not call replaceState');
    assert.ok(
        preventDefaultIdx < assignIdx,
        'preventDefault must execute before assign'
    );

    const navigateStart = routerSource.indexOf('async function navigate(pathname');
    const mountIdx = routerSource.indexOf('await mountRoute(next.route, next.params, token);', navigateStart);
    const scrollIdx = routerSource.indexOf('window.scrollTo(0, 0);', navigateStart);
    assert.ok(navigateStart >= 0, 'router must define navigate(pathname');
    assert.ok(mountIdx >= 0, 'navigate must mount route');
    assert.ok(scrollIdx >= 0, 'navigate must reset scroll after successful route mount');
    assert.ok(mountIdx < scrollIdx, 'navigate must reset scroll after mountRoute');

    assert.ok(
        routerSource.includes("history.scrollRestoration = 'manual';"),
        'router must disable browser scroll restoration for deterministic SPA navigation'
    );

    assert.ok(
        routerSource.includes('navigate(window.location.pathname, null)'),
        'router must perform initial route mount on first load'
    );
    assert.ok(
        routerSource.includes('window.location.assign(url.href);'),
        'click navigation failures must hard-navigate as fallback'
    );
});

test('router asset is not injected when soft navigation is disabled', async () => {
    cleanup();

    const payload = [
        {
            route: '/',
            file: 'pages/index.zen',
            router: false,
            ir: baseIr(
                '<!DOCTYPE html><html><head><!-- ZENITH_STYLES_ANCHOR --></head><body><main>Home</main></body></html>',
                'mod_home',
                '14e6e24af0adb2103ad152405e46035b6ec731b2dd34c53e6798265c9e11e540'
            )
        }
    ];

    const res = runBundler(payload);
    assert.strictEqual(res.status, 0, 'bundler should succeed');

    const manifest = JSON.parse(readFileSync(join(TEST_DIR, 'dist/manifest.json'), 'utf8'));
    assert.ok(!manifest.router, 'manifest.router should be omitted when soft navigation is disabled');
});
