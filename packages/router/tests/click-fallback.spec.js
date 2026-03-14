// ---------------------------------------------------------------------------
// click-fallback.spec.js — Zenith Router
// ---------------------------------------------------------------------------
// Regression test: marked links must opt into soft navigation explicitly,
// fetch fresh HTML before commit, and preserve browser fallbacks when the
// router cannot safely complete the navigation.
// ---------------------------------------------------------------------------

import assert from 'node:assert/strict';
import { renderRouterModule } from '../template.js';

const manifestJson = JSON.stringify(
    {
        entry: '/assets/runtime.11111111.js',
        css: '/assets/styles.22222222.css',
        core: '/assets/core.33333333.js',
        router: '/assets/router.44444444.js',
        hash: 'deadbeef',
        chunks: {
            '/': '/assets/index.aaaaaaa1.js',
            '/about': '/assets/about.bbbbbbb2.js'
        },
        server_routes: ['/about']
    },
    null,
    2
);

const runtimeImport = '/assets/runtime.11111111.js';
const coreImport = '/assets/core.33333333.js';
const opts = { manifestJson, runtimeImport, coreImport };

const source = renderRouterModule(opts);

const clickStart = source.indexOf('document.addEventListener("click"');
assert.ok(clickStart >= 0, 'router template must register delegated click handler');

const clickEnd = source.indexOf('window.addEventListener("popstate"', clickStart);
assert.ok(clickEnd > clickStart, 'click handler block must terminate before popstate setup');

const clickBlock = source.slice(clickStart, clickEnd);

assert.ok(
    clickBlock.includes('closest("a[data-zen-link]")'),
    'click handler must only intercept marked semantic anchors'
);
assert.ok(
    clickBlock.includes('event.preventDefault();'),
    'click handler must prevent default only after explicit opt-in eligibility is confirmed'
);
assert.ok(
    clickBlock.includes('performNavigation(targetUrl, "push", null)'),
    'click handler must delegate to the soft-navigation pipeline'
);

assert.ok(
    source.includes('fetch(targetUrl.href'),
    'router template must fetch fresh route HTML before committing a soft navigation'
);
assert.ok(
    source.includes('history.pushState('),
    'router template must push history on successful forward soft navigation'
);
assert.ok(
    source.includes('history.replaceState('),
    'router template must replace history state for initial entry and popstate bookkeeping'
);
assert.ok(
    source.includes('window.location.assign(targetUrl.href);'),
    'router template must keep assign-based hard fallback for forward navigation failures'
);
assert.ok(
    source.includes('window.location.replace(targetUrl.href);'),
    'router template must keep replace-based hard fallback for popstate recovery'
);
assert.ok(
    source.includes('"navigation:before-leave"') &&
    source.includes('"navigation:before-enter"'),
    'router template must expose navigation lifecycle hooks for transition orchestration'
);
assert.ok(
    source.includes('await emitNavigationEvent(context, "navigation:before-swap"'),
    'router template must await before-swap lifecycle hooks before DOM commit'
);

assert.ok(
    !source.includes('__zenith_ssr='),
    'router template must not encode SSR payload into query strings'
);
assert.ok(
    !source.includes('eval('),
    'router template must not use eval()'
);
assert.ok(
    !source.includes('new Function('),
    'router template must not use new Function()'
);

console.log('click-fallback.spec.js passed');
