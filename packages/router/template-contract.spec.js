import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderRouterModule } from './template.js';
import { renderRouterModule as renderRouterModuleFromPackage } from '@zenithbuild/router/template';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const goldenPath = path.join(__dirname, 'tests', 'fixtures', 'router-template.golden.js');

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

const sourceA = renderRouterModule(opts);
const sourceB = renderRouterModule(opts);

assert.equal(typeof sourceA, 'string', 'renderRouterModule() must return a string');
assert.ok(sourceA.length > 0, 'router template output must not be empty');
assert.equal(sourceA, sourceB, 'same inputs must produce byte-identical output');
assert.equal(sourceA.includes('\r'), false, 'router template must normalize line endings to \\n');

assert.ok(sourceA.includes(`from '${runtimeImport}'`), 'router template must import runtime via provided specifier');
assert.ok(sourceA.includes(`from '${coreImport}'`), 'router template must import core via provided specifier');
assert.ok(sourceA.includes('const __ZENITH_MANIFEST__ ='), 'router template must inject __ZENITH_MANIFEST__ constant');
assert.ok(sourceA.includes(manifestJson), 'router template must inline provided manifestJson string');
assert.ok(
    sourceA.includes('import(__ZENITH_MANIFEST__.chunks[route])'),
    'router template must use manifest-driven dynamic import shape'
);
assert.equal(
    sourceA.includes('import { _dispatchRouteEvent as __zenithDispatchRouteEvent'),
    false,
    'router template must not import route event helpers from runtime'
);
assert.ok(
    sourceA.includes('function dispatchRouteEvent(eventName, payload)'),
    'router template must provide internal route event dispatch helper'
);
assert.ok(
    sourceA.includes('async function dispatchRouteEventAsync(eventName, payload)'),
    'router template must provide async route event dispatch for awaited lifecycle hooks'
);

const clickStart = sourceA.indexOf('document.addEventListener("click"');
assert.ok(clickStart >= 0, 'router template must register delegated click handler');

const targetIndex = sourceA.indexOf('closest("a[data-zen-link]")', clickStart);
assert.ok(targetIndex >= 0, 'click flow must target a[data-zen-link]');

const preventDefaultIndex = sourceA.indexOf('event.preventDefault();', clickStart);
const fetchIndex = sourceA.indexOf('fetch(targetUrl.href');
const pushStateIndex = sourceA.indexOf('history.pushState(');
const replaceStateIndex = sourceA.indexOf('history.replaceState(');
const assignIndex = sourceA.indexOf('window.location.assign(targetUrl.href);');
const replaceLocationIndex = sourceA.indexOf('window.location.replace(targetUrl.href);');
assert.ok(preventDefaultIndex >= 0, 'click handler must call preventDefault before soft navigation');
assert.ok(fetchIndex >= 0, 'click flow must fetch fresh route HTML before commit');
assert.ok(pushStateIndex >= 0, 'router template must push a history entry on successful forward navigation');
assert.ok(replaceStateIndex >= 0, 'router template must replace history state for initial/popstate bookkeeping');
assert.ok(assignIndex >= 0, 'router template must preserve hard-navigation fallback via location.assign');
assert.ok(replaceLocationIndex >= 0, 'router template must preserve replace-style hard fallback for popstate recovery');
assert.ok(
    sourceA.includes('history.scrollRestoration = "manual";'),
    'router template must disable browser scroll restoration'
);
assert.ok(
    sourceA.includes('const __ZENITH_SCROLL_EVENT_NAME = "zx-router-scroll";'),
    'router template must define the internal scroll coordination event'
);
assert.ok(
    sourceA.includes('dispatchScrollEvent("apply"'),
    'router template must dispatch coordinated scroll events'
);

assert.ok(sourceA.includes('window.addEventListener("popstate"'), 'router template must handle popstate');
assert.ok(
    sourceA.includes('mountInitialRoute().catch(function(error) {'),
    'router template must mount immediately on initial load'
);

assert.ok(
    sourceA.includes('encodeURIComponent(toNavigationPath(targetUrl))'),
    'route-check requests must include pathname plus query string'
);
assert.ok(
    sourceA.includes('const rootRequiredCatchAll = !optionalCatchAll && routeSegments.length === 1;'),
    'router template must allow root required catch-all routes to match "/"'
);

assert.ok(sourceA.includes('fetch("/__zenith/route-check'), 'router template must query route protection fallback');
assert.equal(
    sourceA.includes('routeId: resolved.route.route_id'),
    false,
    'route-check event payload must not read invalid route_id property'
);
assert.ok(
    sourceA.includes('routeId: resolved.route'),
    'route-check event payload must include resolved route id string'
);
assert.ok(
    sourceA.includes('const __ZENITH_RUNTIME_ROUTE_HTML_KEY = "__zenith_route_html";'),
    'router template must expose the runtime route HTML override channel'
);
assert.ok(
    sourceA.includes('parsed.getElementById("zenith-ssr-data")'),
    'router template must parse SSR data from the zenith-ssr-data script tag'
);
assert.equal(
    sourceA.includes('html.match(/window\\\\.__zenith_ssr_data'),
    false,
    'router template must not extract SSR data with a brittle HTML regex'
);
assert.ok(
    sourceA.includes('"navigation:before-leave"'),
    'router template must include navigation lifecycle event names'
);
assert.ok(
    sourceA.includes('buildNavigationPayload(context'),
    'router template must build lifecycle payloads from the active navigation context'
);
assert.equal(
    sourceA.includes("searchParams.get('__zenith_ssr')"),
    false,
    'router template must not read SSR query params'
);
assert.equal(
    sourceA.includes('__zenith_ssr='),
    false,
    'router template must not encode SSR payload into import query strings'
);
assert.equal(sourceA.includes('.zen'), false, 'router template must not contain .zen references');
assert.equal(sourceA.includes('zenith:'), false, 'router template must not contain zenith:* specifiers');

const performNavigationStart = sourceA.indexOf('async function performNavigation(targetUrl, historyMode, popstateState)');
const mountIdx = sourceA.indexOf('const mounted = await mountRoute(resolved.route, resolved.params, context.token, payload);', performNavigationStart);
const requestIdx = sourceA.indexOf('dispatchRouteEvent("navigation:request", buildNavigationPayload(context));');
const dataReadyIdx = sourceA.indexOf('emitNavigationEvent(context, "navigation:data-ready"');
const scrollBeforeIdx = sourceA.indexOf('dispatchScrollEvent("before"', performNavigationStart);
const beforeLeaveIdx = sourceA.indexOf('await emitNavigationEvent(context, "navigation:before-leave"', performNavigationStart);
const leaveCompleteIdx = sourceA.indexOf('emitNavigationEvent(context, "navigation:leave-complete"', performNavigationStart);
const beforeSwapIdx = sourceA.indexOf('await emitNavigationEvent(context, "navigation:before-swap"', performNavigationStart);
const contentSwappedIdx = sourceA.indexOf('emitNavigationEvent(context, "navigation:content-swapped"', performNavigationStart);
const beforeEnterIdx = sourceA.indexOf('await emitNavigationEvent(context, "navigation:before-enter"', performNavigationStart);
const scrollAfterIdx = sourceA.indexOf('dispatchScrollEvent("after"', performNavigationStart);
const enterCompleteIdx = sourceA.indexOf('emitNavigationEvent(context, "navigation:enter-complete"', performNavigationStart);
const abortIdx = sourceA.indexOf('dispatchRouteEvent("navigation:abort"');
const errorIdx = sourceA.indexOf('dispatchRouteEvent("navigation:error"');

assert.ok(performNavigationStart >= 0, 'router template must define performNavigation');
assert.ok(mountIdx >= 0, 'router template must mount the route during navigation');
assert.ok(requestIdx >= 0, 'router template must emit navigation:request');
assert.ok(dataReadyIdx >= 0, 'router template must emit navigation:data-ready');
assert.ok(beforeLeaveIdx >= 0, 'router template must emit awaited navigation:before-leave');
assert.ok(leaveCompleteIdx >= 0, 'router template must emit navigation:leave-complete');
assert.ok(beforeSwapIdx >= 0, 'router template must emit awaited navigation:before-swap');
assert.ok(contentSwappedIdx >= 0, 'router template must emit navigation:content-swapped');
assert.ok(beforeEnterIdx >= 0, 'router template must emit awaited navigation:before-enter');
assert.ok(enterCompleteIdx >= 0, 'router template must emit navigation:enter-complete');
assert.ok(abortIdx >= 0, 'router template must emit navigation:abort');
assert.ok(errorIdx >= 0, 'router template must emit navigation:error');
assert.ok(
    requestIdx < dataReadyIdx &&
    dataReadyIdx < scrollBeforeIdx &&
    scrollBeforeIdx < beforeLeaveIdx &&
    beforeLeaveIdx < leaveCompleteIdx &&
    leaveCompleteIdx < beforeSwapIdx &&
    beforeSwapIdx < mountIdx &&
    mountIdx < contentSwappedIdx &&
    contentSwappedIdx < beforeEnterIdx &&
    beforeEnterIdx < scrollAfterIdx &&
    scrollAfterIdx < enterCompleteIdx,
    'navigation lifecycle hooks must follow the deterministic Phase 2 order'
);

const sourceFromPackage = renderRouterModuleFromPackage(opts);
assert.equal(sourceFromPackage, sourceA, 'subpath export must resolve and return the same deterministic source');

const golden = readFileSync(goldenPath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
assert.equal(sourceA, golden, 'router template output must match golden bytes for the fixed fixture');

console.log('template-contract.spec.js passed');
