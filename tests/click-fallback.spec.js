// ---------------------------------------------------------------------------
// click-fallback.spec.js — Zenith Router
// ---------------------------------------------------------------------------
// Regression test: the router template click handler must NOT call
// preventDefault() on data-zen-link clicks, and must not use
// pushState/replaceState. Navigation must be fail-safe.
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
        }
    },
    null,
    2
);

const runtimeImport = '/assets/runtime.11111111.js';
const coreImport = '/assets/core.33333333.js';
const opts = { manifestJson, runtimeImport, coreImport };

const source = renderRouterModule(opts);

// 1. Find the click handler block
const clickStart = source.indexOf("document.addEventListener('click'");
assert.ok(clickStart >= 0, 'router template must register delegated click handler');

const clickEnd = source.indexOf('});', clickStart);
assert.ok(clickEnd > clickStart, 'click handler must have a closing bracket');

const clickBlock = source.slice(clickStart, clickEnd);

// 2. The click handler must NOT call preventDefault
assert.ok(
    !clickBlock.includes('preventDefault'),
    'click handler must NOT call preventDefault() — if the router fails, links must still work via browser default'
);

// 3. The click handler must still call location.assign (wrapped in try/catch)
assert.ok(
    clickBlock.includes('window.location.assign(url.href)'),
    'click handler must call location.assign for hard navigation'
);

// 4. The location.assign must be wrapped in try/catch for fail-safety
assert.ok(
    clickBlock.includes('try {'),
    'location.assign must be wrapped in try/catch for fail-safe behavior'
);
assert.ok(
    clickBlock.includes('catch'),
    'click handler must catch errors from location.assign'
);

// 5. No pushState/replaceState anywhere in the entire template
assert.ok(
    !source.includes('pushState'),
    'router template must NOT use pushState'
);
assert.ok(
    !source.includes('replaceState'),
    'router template must NOT use replaceState'
);

// 6. No eval/new Function anywhere
assert.ok(
    !source.includes('eval('),
    'router template must NOT use eval()'
);
assert.ok(
    !source.includes('new Function('),
    'router template must NOT use new Function()'
);

// 7. No __zenith_ssr= query param channel
assert.ok(
    !source.includes('__zenith_ssr='),
    'router template must NOT use __zenith_ssr= query param channel'
);

console.log('click-fallback.spec.js passed');
