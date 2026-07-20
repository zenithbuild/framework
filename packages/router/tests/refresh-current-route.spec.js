import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { jest } from '@jest/globals';

import { renderRouterModule } from '../template.js';
import { refreshCurrentRoute } from '../dist/index.js';

function createHtml({ count, viewer, includeForm = false }) {
    return [
        '<!doctype html>',
        '<html>',
        '<head><title>Dashboard</title></head>',
        '<body>',
        '<main id="app"></main>',
        includeForm
            ? '<form data-zen-form method="POST" action="/"><button type="submit" name="save" value="1">Save</button></form>'
            : '',
        `<script id="zenith-ssr-data">window.__zenith_ssr_data = ${JSON.stringify({ count, viewer })};</script>`,
        '</body>',
        '</html>'
    ].join('');
}

async function flushRouter() {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
}

function createMockResponse(body, { status = 200, headers = {}, type = 'default' } = {}) {
    const normalizedHeaders = new Map(
        Object.entries(headers).map(([key, value]) => [String(key).toLowerCase(), String(value)])
    );
    const textBody = typeof body === 'string' ? body : JSON.stringify(body);
    const jsonBody = typeof body === 'string' ? null : body;

    return {
        ok: status >= 200 && status < 300,
        status,
        type,
        headers: {
            get(name) {
                return normalizedHeaders.get(String(name).toLowerCase()) ?? null;
            }
        },
        async text() {
            return textBody;
        },
        async json() {
            if (jsonBody !== null) {
                return jsonBody;
            }
            return JSON.parse(textBody);
        }
    };
}

async function createTemplateHarness({ includeForm = false } = {}) {
    const root = await mkdtemp(join(tmpdir(), 'zenith-router-refresh-'));
    const runtimePath = join(root, 'runtime.mjs');
    const corePath = join(root, 'core.mjs');
    const homePath = join(root, 'home.mjs');
    const routerPath = join(root, 'router.mjs');

    await writeFile(runtimePath, 'export function hydrate() {}\n', 'utf8');
    await writeFile(corePath, 'export function zenOnMount() {}\n', 'utf8');
    await writeFile(
        homePath,
        [
            'function readPayload(document) {',
            '  if (globalThis.__zenith_ssr_data && typeof globalThis.__zenith_ssr_data === "object") {',
            '    return globalThis.__zenith_ssr_data;',
            '  }',
            '  const script = document.getElementById("zenith-ssr-data");',
            '  if (!script || typeof script.textContent !== "string") return {};',
            '  const marker = "window.__zenith_ssr_data =";',
            '  const index = script.textContent.indexOf(marker);',
            '  if (index === -1) return {};',
            '  try {',
            '    return JSON.parse(script.textContent.slice(index + marker.length).trim().replace(/;$/, ""));',
            '  } catch {',
            '    return {};',
            '  }',
            '}',
            'export default function mount(document) {',
            '  const payload = readPayload(document);',
            '  const main = document.querySelector("main") || document.body;',
            '  main.textContent = `${payload.viewer || "guest"}:${payload.count || 0}`;',
            '  return function cleanup() {};',
            '}'
        ].join('\n'),
        'utf8'
    );

    const manifestJson = JSON.stringify(
        {
            entry: '/assets/runtime.js',
            base_path: '/',
            css: '/assets/styles.css',
            core: '/assets/core.js',
            router: '/assets/router.js',
            hash: 'refresh-hash',
            chunks: {
                '/': pathToFileURL(homePath).href
            },
            server_routes: ['/']
        },
        null,
        2
    );

    await writeFile(
        routerPath,
        renderRouterModule({
            manifestJson,
            runtimeImport: pathToFileURL(runtimePath).href,
            coreImport: pathToFileURL(corePath).href,
            routeCheck: true
        }),
        'utf8'
    );

    let count = 1;
    let viewer = 'guest';
    let routeCheckMode = 'allow';
    let transientGetFailures = 0;
    const fetchCalls = [];

    global.fetch = jest.fn(async (input, init = {}) => {
        const requestUrl = new URL(typeof input === 'string' ? input : String(input.url), window.location.href);
        const method = String(init.method || 'GET').toUpperCase();
        fetchCalls.push(`${method} ${requestUrl.pathname}${requestUrl.search}`);

        if (requestUrl.pathname === '/__zenith/route-check') {
            if (routeCheckMode === 'redirect') {
                return createMockResponse({ result: { kind: 'redirect', location: '/login', status: 302 } }, {
                    status: 200,
                    headers: { 'content-type': 'application/json' }
                });
            }
            if (routeCheckMode === 'deny') {
                return createMockResponse({ result: { kind: 'deny', status: 403, message: 'Forbidden' } }, {
                    status: 200,
                    headers: { 'content-type': 'application/json' }
                });
            }
            return createMockResponse({ result: { kind: 'allow' } }, {
                status: 200,
                headers: { 'content-type': 'application/json' }
            });
        }

        if (requestUrl.pathname === '/api/increment.resource' && method === 'POST') {
            count += 1;
            return createMockResponse({ ok: true, count }, {
                status: 200,
                headers: { 'content-type': 'application/json' }
            });
        }

        if (requestUrl.pathname === '/api/login.resource' && method === 'POST') {
            viewer = 'signed-in';
            return createMockResponse({ ok: true }, {
                status: 200,
                headers: { 'content-type': 'application/json', 'set-cookie': 'zenith_session=signed' }
            });
        }

        if (requestUrl.pathname === '/api/logout.resource' && method === 'POST') {
            viewer = 'guest';
            return createMockResponse({ ok: true }, {
                status: 200,
                headers: { 'content-type': 'application/json', 'set-cookie': 'zenith_session=' }
            });
        }

        if (requestUrl.pathname === '/' && method === 'POST') {
            count += 1;
            return createMockResponse(createHtml({ count, viewer, includeForm }), {
                status: 200,
                headers: { 'content-type': 'text/html; charset=utf-8' }
            });
        }

        if (requestUrl.pathname === '/' && method === 'GET') {
            if (transientGetFailures > 0) {
                transientGetFailures -= 1;
                throw new TypeError('Failed to fetch');
            }
            return createMockResponse(createHtml({ count, viewer, includeForm }), {
                status: 200,
                headers: { 'content-type': 'text/html; charset=utf-8' }
            });
        }

        return createMockResponse('Not Found', {
            status: 404,
            headers: { 'content-type': 'text/plain; charset=utf-8' }
        });
    });

    document.documentElement.innerHTML = createHtml({ count, viewer, includeForm });
    history.replaceState({}, '', '/');
    global.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
    global.scrollTo = jest.fn();

    await import(pathToFileURL(routerPath).href + `?t=${Date.now()}`);
    await flushRouter();

    return {
        root,
        fetchCalls,
        getMainText: () => {
            const main = document.querySelector('main');
            return main ? main.textContent : '';
        },
        setRouteCheckMode: (value) => {
            routeCheckMode = value;
        },
        setTransientGetFailures: (value) => {
            transientGetFailures = value;
        }
    };
}

describe('refreshCurrentRoute runtime bridge', () => {
    let harness = null;

    beforeEach(() => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(async () => {
        if (harness) {
            await rm(harness.root, { recursive: true, force: true });
            harness = null;
        }
        delete global.fetch;
        delete global.requestAnimationFrame;
        delete global.__zenith_refresh_current_route;
        delete global.__zenith_ssr_data;
        document.documentElement.innerHTML = '<html><head></head><body></body></html>';
        history.replaceState({}, '', '/');
        jest.restoreAllMocks();
    });

    test('refreshes the current page after a successful resource POST without pushing history', async () => {
        harness = await createTemplateHarness();
        const pushSpy = jest.spyOn(history, 'pushState');

        expect(harness.getMainText()).toBe('guest:1');

        await fetch('/api/increment.resource', { method: 'POST' });
        expect(harness.getMainText()).toBe('guest:1');

        await refreshCurrentRoute();
        await flushRouter();

        expect(harness.getMainText()).toBe('guest:2');
        expect(pushSpy).not.toHaveBeenCalled();
        expect(harness.fetchCalls).toContain('POST /api/increment.resource');
        expect(harness.fetchCalls).toContain('GET /__zenith/route-check?path=%2F');
        expect(harness.fetchCalls).toContain('GET /');
    });

    test('remains the explicit bridge after resource-route sign-in and sign-out', async () => {
        harness = await createTemplateHarness();

        expect(harness.getMainText()).toBe('guest:1');

        await fetch('/api/login.resource', { method: 'POST' });
        expect(harness.getMainText()).toBe('guest:1');

        await refreshCurrentRoute();
        await flushRouter();
        expect(harness.getMainText()).toBe('signed-in:1');

        await fetch('/api/logout.resource', { method: 'POST' });
        expect(harness.getMainText()).toBe('signed-in:1');

        await refreshCurrentRoute();
        await flushRouter();
        expect(harness.getMainText()).toBe('guest:1');
    });

    test('keeps page action HTML freshness automatic without calling refreshCurrentRoute', async () => {
        harness = await createTemplateHarness({ includeForm: true });
        const form = document.querySelector('form');
        const button = document.querySelector('button');
        const submit = new Event('submit', { bubbles: true, cancelable: true });
        Object.defineProperty(submit, 'submitter', { configurable: true, value: button });

        expect(harness.getMainText()).toBe('guest:1');

        form.dispatchEvent(submit);
        await flushRouter();
        await flushRouter();

        expect(harness.getMainText()).toBe('guest:2');
    });

    test('preserves redirect fallback behavior during refresh', async () => {
        harness = await createTemplateHarness();
        harness.setRouteCheckMode('redirect');

        await refreshCurrentRoute();
        await flushRouter();

        expect(harness.fetchCalls).toEqual(['GET /__zenith/route-check?path=%2F']);
        expect(harness.getMainText()).toBe('guest:1');
    });

    test('retries one transient current document fetch without a browser fallback', async () => {
        harness = await createTemplateHarness();

        harness.setTransientGetFailures(1);
        await refreshCurrentRoute();
        await flushRouter();

        expect(harness.getMainText()).toBe('guest:1');
        expect(console.error).not.toHaveBeenCalled();
        expect(harness.fetchCalls.filter((call) => call === 'GET /')).toHaveLength(2);
    });

    test('preserves deny fallback behavior during refresh', async () => {
        harness = await createTemplateHarness();
        harness.setRouteCheckMode('deny');

        await refreshCurrentRoute();
        await flushRouter();

        expect(harness.fetchCalls).toEqual(['GET /__zenith/route-check?path=%2F']);
        expect(harness.getMainText()).toBe('guest:1');
    });
});
