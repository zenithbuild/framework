import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
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

const clickStart = sourceA.indexOf("document.addEventListener('click'");
assert.ok(clickStart >= 0, 'router template must register delegated click handler');

const targetIndex = sourceA.indexOf("closest('a[data-zen-link]')", clickStart);
assert.ok(targetIndex >= 0, 'click flow must target a[data-zen-link]');

const preventDefaultIndex = sourceA.indexOf('event.preventDefault();', clickStart);
const tryCatchIndex = sourceA.indexOf('try {', clickStart);
const assignIndex = sourceA.indexOf('window.location.assign(url.href);', tryCatchIndex);
assert.ok(preventDefaultIndex >= 0, 'click handler must call preventDefault for route validation checks');
assert.ok(assignIndex >= 0, 'click handler must conditionally call location.assign for hard navigation');

assert.ok(tryCatchIndex >= 0, 'click handler must wrap SPA navigate in try/catch for fail-safety');


const navigateStart = sourceA.indexOf('async function navigate(pathname, url)');
const mountIndex = sourceA.indexOf('await mountRoute(next.route, next.params, token);', navigateStart);
const scrollResetIndex = sourceA.indexOf('window.scrollTo(0, 0);', navigateStart);
assert.ok(mountIndex >= 0, 'navigate must mount the route before scroll reset');
assert.ok(scrollResetIndex >= 0, 'navigate must reset scroll after route mount');
assert.ok(mountIndex < scrollResetIndex, 'navigate must reset scroll after mountRoute');
assert.ok(
    sourceA.includes("history.scrollRestoration = 'manual';"),
    'router template must disable browser scroll restoration'
);

assert.ok(sourceA.includes("window.addEventListener('popstate'"), 'router template must handle popstate');
assert.ok(
    sourceA.includes('navigate(window.location.pathname, null)'),
    'router template must mount immediately on initial load'
);

assert.ok(
    sourceA.includes('window.location.assign(url.href);'),
    'router template must hard-fallback via location.assign on navigation failure'
);
assert.ok(
    sourceA.includes('const rootRequiredCatchAll = !optionalCatchAll && routeSegments.length === 1;'),
    'router template must allow root required catch-all routes to match "/"'
);

assert.ok(sourceA.includes('fetch("/__zenith/route-check'), 'router template must query route protection fallback');
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

const sourceFromPackage = renderRouterModuleFromPackage(opts);
assert.equal(sourceFromPackage, sourceA, 'subpath export must resolve and return the same deterministic source');

writeFileSync(goldenPath, sourceA, 'utf8');
const golden = readFileSync(goldenPath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
assert.equal(sourceA, golden, 'router template output must match golden bytes for the fixed fixture');

console.log('template-contract.spec.js passed');
