import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const CWD = process.cwd();
const TEST_DIR = join(CWD, 'tests/tmp_router_click_contract');

function resolveCliBin() {
    const candidates = [
        join(CWD, 'target/debug/zenith-bundler'),
        join(CWD, 'target/release/zenith-bundler'),
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

test('router click contract fetches fresh HTML and commits history only after successful soft navigation', async () => {
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

    const clickStart = routerSource.indexOf('document.addEventListener("click"');
    assert.ok(clickStart >= 0, 'router must attach delegated click handler');
    const preventDefaultIdx = routerSource.indexOf('event.preventDefault();', clickStart);
    const targetIdx = routerSource.indexOf('closest("a[data-zen-link]")', clickStart);
    const fetchIdx = routerSource.indexOf('fetch(targetUrl.href');
    const performNavigationIdx = routerSource.indexOf('performNavigation(targetUrl, "push", null)', clickStart);
    const assignIdx = routerSource.indexOf('window.location.assign(targetUrl.href)');
    const locationReplaceIdx = routerSource.indexOf('window.location.replace(targetUrl.href);');
    const pushStateIdx = routerSource.indexOf('pushState(');
    const replaceStateIdx = routerSource.indexOf('replaceState(');
    const beforeLeaveIdx = routerSource.indexOf('await emitNavigationEvent(context, "navigation:before-leave"');
    const beforeSwapIdx = routerSource.indexOf('await emitNavigationEvent(context, "navigation:before-swap"');
    const beforeEnterIdx = routerSource.indexOf('await emitNavigationEvent(context, "navigation:before-enter"');
    assert.ok(preventDefaultIdx >= 0, 'click flow must call preventDefault');
    assert.ok(targetIdx >= 0, 'click flow must target a[data-zen-link]');
    assert.ok(fetchIdx >= 0, 'click flow must fetch fresh HTML before commit');
    assert.ok(assignIdx >= 0, 'click flow must call window.location.assign(targetUrl.href)');
    assert.ok(locationReplaceIdx >= 0, 'router runtime must call window.location.replace for popstate recovery');
    assert.ok(pushStateIdx >= 0, 'router runtime must call pushState');
    assert.ok(replaceStateIdx >= 0, 'router runtime must call replaceState');
    assert.ok(beforeLeaveIdx >= 0, 'router runtime must expose navigation:before-leave');
    assert.ok(beforeSwapIdx >= 0, 'router runtime must expose navigation:before-swap');
    assert.ok(beforeEnterIdx >= 0, 'router runtime must expose navigation:before-enter');
    assert.ok(
        preventDefaultIdx < performNavigationIdx,
        'preventDefault must execute before the click flow delegates into performNavigation'
    );

    const performNavigationStart = routerSource.indexOf('async function performNavigation(targetUrl, historyMode, popstateState)');
    const requestIdx = routerSource.indexOf('dispatchRouteEvent("navigation:request", buildNavigationPayload(context));', performNavigationStart);
    const dataReadyIdx = routerSource.indexOf('emitNavigationEvent(context, "navigation:data-ready"', performNavigationStart);
    const mountIdx = routerSource.indexOf('const mounted = await mountRoute(resolved.route, resolved.params, context.token, payload);', performNavigationStart);
    const contentSwappedIdx = routerSource.indexOf('emitNavigationEvent(context, "navigation:content-swapped"', performNavigationStart);
    const scrollIdx = routerSource.indexOf('dispatchScrollEvent("apply"', performNavigationStart);
    const enterCompleteIdx = routerSource.indexOf('emitNavigationEvent(context, "navigation:enter-complete"', performNavigationStart);
    assert.ok(performNavigationStart >= 0, 'router must define performNavigation(targetUrl, historyMode, popstateState)');
    assert.ok(requestIdx >= 0, 'performNavigation must emit navigation:request');
    assert.ok(dataReadyIdx >= 0, 'performNavigation must emit navigation:data-ready');
    assert.ok(mountIdx >= 0, 'performNavigation must mount the route');
    assert.ok(contentSwappedIdx >= 0, 'performNavigation must emit navigation:content-swapped');
    assert.ok(enterCompleteIdx >= 0, 'performNavigation must emit navigation:enter-complete');
    assert.ok(scrollIdx >= 0, 'performNavigation must coordinate scroll after route mount');
    assert.ok(
        requestIdx < dataReadyIdx &&
        dataReadyIdx < beforeLeaveIdx &&
        beforeLeaveIdx < beforeSwapIdx &&
        beforeSwapIdx < mountIdx &&
        mountIdx < contentSwappedIdx &&
        contentSwappedIdx < scrollIdx &&
        scrollIdx < beforeEnterIdx &&
        beforeEnterIdx < enterCompleteIdx,
        'performNavigation must keep lifecycle ordering deterministic'
    );

    assert.ok(
        routerSource.includes('history.scrollRestoration = "manual";'),
        'router must disable browser scroll restoration for deterministic SPA navigation'
    );
    assert.ok(
        routerSource.includes('const __ZENITH_SCROLL_EVENT_NAME = "zx-router-scroll";'),
        'router must publish the internal scroll coordination event'
    );
    assert.ok(
        routerSource.includes('encodeURIComponent(toNavigationPath(targetUrl))'),
        'route-check requests must include pathname plus query string'
    );

    assert.ok(
        routerSource.includes('mountInitialRoute().catch(function(error) {'),
        'router must perform initial route mount on first load'
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
