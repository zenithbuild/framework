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

function smokeHandler(request, response) {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/docs/secure' && url.searchParams.get('auth') === 'no') {
        response.writeHead(307, { location: '/docs/login?next=%2Fdocs%2Fsecure%3Fauth%3Dno' });
        response.end();
        return;
    }
    if (url.pathname === '/docs/secure' && url.searchParams.get('auth') === 'yes') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end('<main>Secure</main>');
        return;
    }
    if (url.pathname === '/docs/__zenith/route-check') {
        if (request.headers['x-zenith-route-check'] !== '1') {
            json(response, 403, { error: 'forbidden' });
            return;
        }
        const target = url.searchParams.get('path');
        if (target === '/docs/secure?auth=no') {
            json(response, 200, {
                result: {
                    kind: 'redirect',
                    status: 307,
                    location: '/docs/login?next=%2Fdocs%2Fsecure%3Fauth%3Dno'
                },
                routeId: 'secure'
            });
            return;
        }
        if (target === '/docs/secure?auth=yes') {
            json(response, 200, { result: { kind: 'allow' }, routeId: 'secure' });
            return;
        }
        if (target === '/docs/api/ping') {
            json(response, 404, { error: 'route_not_found' });
            return;
        }
    }
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('not found');
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
    await withSmokeServer(smokeHandler, async (baseUrl) => {
        const result = await runHostedAdapterSmoke({
            provider: 'netlify',
            baseUrl,
            basePath: '/docs'
        });
        assert.equal(result.ok, true);
        assert.deepEqual(result.checks.map((entry) => entry.ok), [true, true, true, true, true, true]);
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
