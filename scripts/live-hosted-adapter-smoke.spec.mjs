import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { parseArgs, runHostedAdapterSmoke } from './live-hosted-adapter-smoke.mjs';

function json(response, status, body) {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
}

async function withSmokeServer(handler, callback) {
    const server = createServer(handler);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    try {
        return await callback(`http://127.0.0.1:${address.port}`);
    } finally {
        await new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        });
    }
}

function joinBasePath(basePath, path) {
    return `${basePath === '/' ? '' : basePath}${path}`;
}

function createSmokeHandler({
    basePath = '/docs',
    directRedirectLocation,
    routeCheckRedirectLocation
} = {}) {
    const deniedPath = joinBasePath(basePath, '/secure?auth=no');
    const allowedPath = joinBasePath(basePath, '/secure?auth=yes');
    const loginPath = joinBasePath(basePath, '/login');
    const expectedRedirect = `${loginPath}?next=${encodeURIComponent(deniedPath)}`;
    const directLocation = directRedirectLocation || expectedRedirect;
    const routeCheckLocation = routeCheckRedirectLocation || expectedRedirect;

    return function smokeHandler(request, response) {
        const url = new URL(request.url || '/', 'http://127.0.0.1');
        if (url.pathname === joinBasePath(basePath, '/secure') && url.searchParams.get('auth') === 'no') {
            response.writeHead(307, { location: directLocation });
            response.end();
            return;
        }
        if (url.pathname === joinBasePath(basePath, '/secure') && url.searchParams.get('auth') === 'yes') {
            response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            response.end('<main>Secure</main>');
            return;
        }
        if (url.pathname === joinBasePath(basePath, '/__zenith/route-check')) {
            if (request.headers['x-zenith-route-check'] !== '1') {
                json(response, 403, { error: 'forbidden' });
                return;
            }
            const target = url.searchParams.get('path');
            if (target === deniedPath) {
                json(response, 200, {
                    result: {
                        kind: 'redirect',
                        status: 307,
                        location: routeCheckLocation
                    },
                    routeId: 'secure'
                });
                return;
            }
            if (target === allowedPath) {
                json(response, 200, { result: { kind: 'allow' }, routeId: 'secure' });
                return;
            }
            if (target === joinBasePath(basePath, '/api/ping')) {
                json(response, 404, { error: 'route_not_found' });
                return;
            }
        }
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('not found');
    };
}

test('parseArgs normalizes provider, origin, and base path', () => {
    assert.deepEqual(parseArgs([
        '--provider',
        'Vercel',
        '--base-url=https://example.com',
        '--base-path',
        '/docs'
    ]), {
        provider: 'vercel',
        baseUrl: 'https://example.com',
        basePath: '/docs'
    });
});

test('runHostedAdapterSmoke passes against the expected hosted smoke shape', async () => {
    await withSmokeServer(createSmokeHandler(), async (baseUrl) => {
        const result = await runHostedAdapterSmoke({
            provider: 'netlify',
            baseUrl,
            basePath: '/docs'
        });
        assert.equal(result.ok, true);
        assert.deepEqual(result.checks.map((entry) => entry.ok), [true, true, true, true, true, true]);
    });
});

test('runHostedAdapterSmoke accepts root base path redirects to root login', async () => {
    await withSmokeServer(createSmokeHandler({ basePath: '/' }), async (baseUrl) => {
        const result = await runHostedAdapterSmoke({
            provider: 'vercel',
            baseUrl,
            basePath: '/'
        });
        assert.equal(result.ok, true);
    });
});

test('runHostedAdapterSmoke rejects non-root direct redirects without the base path', async () => {
    await withSmokeServer(createSmokeHandler({
        directRedirectLocation: '/login?next=%2Fsecure%3Fauth%3Dno'
    }), async (baseUrl) => {
        const result = await runHostedAdapterSmoke({
            provider: 'netlify',
            baseUrl,
            basePath: '/docs'
        });
        assert.equal(result.ok, false);
        assert.equal(result.checks[0].ok, false);
        assert.match(result.checks[0].detail, /expected=\/docs\/login/);
    });
});

test('runHostedAdapterSmoke rejects non-root route-check redirects without the base path', async () => {
    await withSmokeServer(createSmokeHandler({
        routeCheckRedirectLocation: '/login?next=%2Fsecure%3Fauth%3Dno'
    }), async (baseUrl) => {
        const result = await runHostedAdapterSmoke({
            provider: 'vercel',
            baseUrl,
            basePath: '/docs'
        });
        assert.equal(result.ok, false);
        assert.equal(result.checks[2].ok, false);
        assert.match(result.checks[2].detail, /expected=\/docs\/login/);
    });
});

test('runHostedAdapterSmoke reports failed checks without throwing', async () => {
    await withSmokeServer((request, response) => {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end('<main>wrong app</main>');
    }, async (baseUrl) => {
        const result = await runHostedAdapterSmoke({ provider: 'vercel', baseUrl });
        assert.equal(result.ok, false);
        assert.ok(result.checks.some((entry) => entry.ok === false));
    });
});
