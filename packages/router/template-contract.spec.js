import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderRouterModule } from './template.js';
import { renderRouterModule as renderRouterModuleFromPackage } from '@zenithbuild/router/template';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const goldenPath = path.join(__dirname, 'tests', 'fixtures', 'router-template.golden.js');
const packageJsonPath = path.join(__dirname, 'package.json');
const templateRefreshPath = path.join(__dirname, 'template-refresh.js');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

const manifestJson = JSON.stringify(
    {
        entry: '/assets/runtime.11111111.js',
        base_path: '/',
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
const opts = { manifestJson, runtimeImport, coreImport, routeCheck: true };

function normalizeRouterTemplateSnapshot(source) {
    return source.replace(/  "guard:(?:start|end)",\n/g, '');
}

assert.equal(existsSync(templateRefreshPath), true, 'router package must keep template-refresh.js in the package root');
assert.equal(
    Array.isArray(packageJson.files) && packageJson.files.includes('template-refresh.js'),
    true,
    'router package publish surface must include template-refresh.js'
);

const sourceA = renderRouterModule(opts);
const sourceB = renderRouterModule(opts);
const sourceNoForms = renderRouterModule({ ...opts, formsEnabled: false });
const sourceNoRouteCheck = renderRouterModule({ ...opts, routeCheck: false });

assert.equal(typeof sourceA, 'string', 'renderRouterModule() must return a string');
assert.ok(sourceA.length > 0, 'router template output must not be empty');
assert.equal(sourceA, sourceB, 'same inputs must produce byte-identical output');
assert.equal(sourceA.includes('\r'), false, 'router template must normalize line endings to \\n');
assert.equal(
    sourceNoRouteCheck.includes('fetch(routeCheckPath() + "?path="'),
    false,
    'route-check disabled output must omit route-check fetch scaffolding'
);

assert.ok(sourceA.includes(`from '${runtimeImport}'`), 'router template must import runtime via provided specifier');
assert.ok(sourceA.includes(`from '${coreImport}'`), 'router template must import core via provided specifier');
assert.ok(sourceA.includes('const __ZENITH_MANIFEST__ ='), 'router template must inject __ZENITH_MANIFEST__ constant');
assert.ok(sourceA.includes('const __ZENITH_ROUTE_MODULES__ ='), 'router template must emit a route importer table');
assert.ok(sourceA.includes('const __ZENITH_ROUTE_CHECK_ENABLED__ = true;'), 'router template must inline route-check capability');
assert.ok(sourceA.includes(manifestJson), 'router template must inline provided manifestJson string');
assert.ok(
    sourceA.includes('"/": () => import("/assets/index.aaaaaaa1.js")') &&
    sourceA.includes('"/about": () => import("/assets/about.bbbbbbb2.js")'),
    'router template must emit literal dynamic imports for every manifest route'
);
assert.equal(
    sourceA.includes('import(routeModuleSpecifier('),
    false,
    'router template must not emit computed route-module imports'
);
assert.equal(
    sourceA.includes('zenith_navigation='),
    false,
    'router template must not use query-string cache busting for route modules'
);
assert.ok(
    sourceA.includes('const superseded = !!context.abortReason || !ensureCurrentNavigation(context);'),
    'router must treat platform-specific aborted fetch errors as superseded navigation'
);
assert.ok(
    sourceA.includes('token below is the authority and discards every stale result'),
    'router must use its navigation token instead of aborting a reusable in-flight connection'
);
assert.ok(
    sourceA.includes('if (activeDocumentRequest)') && sourceA.includes('activeDocumentRequest === documentRequest'),
    'router must serialize document requests and let the newest navigation token win'
);
assert.ok(
    sourceA.includes('for (let attempt = 0; attempt < 2; attempt += 1)'),
    'router must retry one transient current-navigation document fetch failure'
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
const submitStart = sourceA.indexOf('document.addEventListener("submit"');
assert.ok(submitStart >= 0, 'router template must register delegated submit handler');

const targetIndex = sourceA.indexOf('closest("a[data-zen-link]")', clickStart);
assert.ok(targetIndex >= 0, 'click flow must target a[data-zen-link]');
assert.ok(
    sourceA.includes('form.hasAttribute("data-zen-form")'),
    'enhanced form flow must stay opt-in via data-zen-form'
);
assert.ok(
    sourceA.includes('method: "POST"'),
    'enhanced form submissions must use POST for the canonical action flow'
);
assert.ok(
    sourceA.includes('new FormData(form'),
    'enhanced form flow must submit browser-native FormData payloads'
);
assert.equal(
    sourceA.includes('multipart/form-data'),
    false,
    'enhanced form flow must not bail out on multipart form submissions'
);

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

assert.ok(
    sourceA.includes('fetch(routeCheckPath() + "?path="'),
    'router template must query route protection fallback through the normalized base path helper'
);
assert.ok(
    sourceA.includes('const __ZENITH_BASE_PATH__ = normalizeBasePath('),
    'router template must derive a normalized base path from the manifest contract'
);
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
    sourceA.includes('const __ZENITH_REFRESH_CURRENT_ROUTE_KEY = "__zenith_refresh_current_route";'),
    'router template must expose the refresh-current-route bridge key'
);
assert.ok(
    sourceA.includes('async function refreshCurrentRouteInternal()'),
    'router template must define a refreshCurrentRoute internal bridge'
);
assert.ok(
    sourceA.includes('await performNavigation(targetUrl, "refresh", null);'),
    'refreshCurrentRoute must reuse the existing navigation pipeline with refresh mode'
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
assert.equal(sourceA.includes('"guard:start"'), false, 'router template must not declare un-emitted guard:start events');
assert.equal(sourceA.includes('"guard:end"'), false, 'router template must not declare un-emitted guard:end events');
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
assert.equal(
    sourceNoForms.includes('function installEnhancedFormHandling()'),
    false,
    'forms-disabled router output must omit enhanced form helper implementation'
);
assert.equal(
    sourceNoForms.includes('document.addEventListener("submit"'),
    false,
    'forms-disabled router output must omit submit interception wiring'
);
assert.equal(
    sourceNoForms.includes('installEnhancedFormHandling();'),
    false,
    'forms-disabled router output must not install enhanced form handling'
);

const performNavigationStart = sourceA.indexOf('async function performNavigation(targetUrl, historyMode, popstateState)');
const commitNavigationStart = sourceA.indexOf('async function commitNavigationDocument(');
const commitNavigationEnd = sourceA.indexOf('async function performNavigation(targetUrl, historyMode, popstateState)');
const commitNavigationSource = sourceA.slice(commitNavigationStart, commitNavigationEnd);
const mountIdx = sourceA.indexOf('const committed = await commitNavigationDocument(', performNavigationStart);
const requestIdx = sourceA.indexOf('dispatchRouteEvent("navigation:request", buildNavigationPayload(context));');
const dataReadyIdx = commitNavigationSource.indexOf('emitNavigationEvent(context, "navigation:data-ready"');
const scrollBeforeIdx = commitNavigationSource.indexOf('dispatchScrollEvent("before"');
const beforeLeaveIdx = commitNavigationSource.indexOf('await emitNavigationEvent(context, "navigation:before-leave"');
const leaveCompleteIdx = commitNavigationSource.indexOf('emitNavigationEvent(context, "navigation:leave-complete"');
const beforeSwapIdx = commitNavigationSource.indexOf('await emitNavigationEvent(context, "navigation:before-swap"');
const contentSwappedIdx = commitNavigationSource.indexOf('emitNavigationEvent(context, "navigation:content-swapped"');
const beforeEnterIdx = commitNavigationSource.indexOf('await emitNavigationEvent(context, "navigation:before-enter"');
const scrollAfterIdx = commitNavigationSource.indexOf('dispatchScrollEvent("after"');
const enterCompleteIdx = commitNavigationSource.indexOf('emitNavigationEvent(context, "navigation:enter-complete"');
const abortIdx = sourceA.indexOf('dispatchRouteEvent("navigation:abort"');
const errorIdx = sourceA.indexOf('dispatchRouteEvent("navigation:error"');

assert.ok(performNavigationStart >= 0, 'router template must define performNavigation');
assert.ok(commitNavigationStart >= 0, 'router template must define commitNavigationDocument');
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
    requestIdx < mountIdx &&
    dataReadyIdx < scrollBeforeIdx &&
    scrollBeforeIdx < beforeLeaveIdx &&
    beforeLeaveIdx < leaveCompleteIdx &&
    leaveCompleteIdx < beforeSwapIdx &&
    beforeSwapIdx < contentSwappedIdx &&
    contentSwappedIdx < beforeEnterIdx &&
    beforeEnterIdx < scrollAfterIdx &&
    scrollAfterIdx < enterCompleteIdx,
    'navigation lifecycle hooks must follow the deterministic Phase 2 order'
);

const sourceFromPackage = renderRouterModuleFromPackage(opts);
assert.equal(sourceFromPackage, sourceA, 'subpath export must resolve and return the same deterministic source');

const golden = readFileSync(goldenPath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
assert.equal(
    sourceA,
    normalizeRouterTemplateSnapshot(golden),
    'router template output must match golden bytes for the fixed fixture after removed stale event names'
);

console.log('template-contract.spec.js passed');
