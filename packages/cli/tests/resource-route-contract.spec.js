import { data, download, json, resolveRouteResult, text, validateServerExports } from '../src/server-contract.js';

function createRouteContext(method = 'GET') {
    return {
        params: {},
        url: new URL('http://localhost/api/example'),
        headers: {},
        cookies: {},
        request: new Request('http://localhost/api/example', { method }),
        method,
        route: { id: 'api/example', pattern: '/api/example', file: 'pages/api/example.resource.ts' },
        env: {},
        action: null
    };
}

describe('resource route contract', () => {
    test('validateServerExports requires load or action on resource routes', () => {
        expect(() => validateServerExports({
            exports: { guard: async (ctx) => ctx.allow() },
            filePath: 'pages/api/example.resource.ts',
            routeKind: 'resource'
        })).toThrow(/resource routes must export load\(ctx\), action\(ctx\), or both/);
    });

    test('resource GET routes return json explicitly', async () => {
        const resolved = await resolveRouteResult({
            exports: {
                load: async (ctx) => json({ method: ctx.method, route: ctx.route.pattern })
            },
            ctx: createRouteContext('GET'),
            filePath: 'pages/api/example.resource.ts',
            routeKind: 'resource'
        });

        expect(resolved).toEqual({
            result: { kind: 'json', data: { method: 'GET', route: '/api/example' }, status: 200 },
            trace: { guard: 'none', action: 'none', load: 'json' },
            status: 200
        });
    });

    test('resource POST routes return text explicitly', async () => {
        const resolved = await resolveRouteResult({
            exports: {
                action: async (ctx) => {
                    void ctx;
                    return text('ok', 202);
                }
            },
            ctx: createRouteContext('POST'),
            filePath: 'pages/api/example.resource.ts',
            routeKind: 'resource'
        });

        expect(resolved).toEqual({
            result: { kind: 'text', body: 'ok', status: 202 },
            trace: { guard: 'none', action: 'text', load: 'none' },
            status: 202
        });
    });

    test('resource GET routes return downloads explicitly', async () => {
        const resolved = await resolveRouteResult({
            exports: {
                load: async (ctx) => {
                    void ctx;
                    return download('hello', { filename: 'hello.txt', contentType: 'text/plain; charset=utf-8' });
                }
            },
            ctx: createRouteContext('GET'),
            filePath: 'pages/api/example.resource.ts',
            routeKind: 'resource'
        });

        expect(resolved).toEqual({
            result: {
                kind: 'download',
                body: 'hello',
                bodyEncoding: 'utf8',
                bodySize: 5,
                filename: 'hello.txt',
                contentType: 'text/plain; charset=utf-8',
                status: 200
            },
            trace: { guard: 'none', action: 'none', load: 'download' },
            status: 200
        });
    });

    test('resource routes fail explicitly on unsupported methods', async () => {
        const resolved = await resolveRouteResult({
            exports: {
                load: async (ctx) => {
                    void ctx;
                    return json({ ok: true });
                }
            },
            ctx: createRouteContext('PUT'),
            filePath: 'pages/api/example.resource.ts',
            routeKind: 'resource'
        });

        expect(resolved).toEqual({
            result: { kind: 'text', body: 'Method Not Allowed', status: 405 },
            trace: { guard: 'none', action: 'none', load: 'none' },
            status: 405
        });
    });

    test('resource routes reject page-only data() results', async () => {
        await expect(resolveRouteResult({
            exports: {
                load: async (ctx) => {
                    void ctx;
                    return data({ ok: true });
                }
            },
            ctx: createRouteContext('GET'),
            filePath: 'pages/api/example.resource.ts',
            routeKind: 'resource'
        })).rejects.toThrow(/kind "data" is not allowed here/);
    });

    test('page routes reject resource-only json() results', async () => {
        await expect(resolveRouteResult({
            exports: {
                load: async (ctx) => {
                    void ctx;
                    return json({ ok: true });
                }
            },
            ctx: createRouteContext('GET'),
            filePath: 'pages/example.zen'
        })).rejects.toThrow(/kind "json" is not allowed here/);
    });

    test('page routes reject resource-only download() results', async () => {
        await expect(resolveRouteResult({
            exports: {
                load: async (ctx) => {
                    void ctx;
                    return download('hello', { filename: 'hello.txt' });
                }
            },
            ctx: createRouteContext('GET'),
            filePath: 'pages/example.zen'
        })).rejects.toThrow(/kind "download" is not allowed here/);
    });

    test('resource json payloads still use the JSON serialization guard', async () => {
        await expect(resolveRouteResult({
            exports: {
                load: async (ctx) => {
                    void ctx;
                    return json({ createdAt: new Date() });
                }
            },
            ctx: createRouteContext('GET'),
            filePath: 'pages/api/example.resource.ts',
            routeKind: 'resource'
        })).rejects.toThrow(/Date is not allowed at \$\.createdAt/);
    });

    test('download helper rejects invalid filenames', () => {
        expect(() => download('bad', { filename: '../secret.txt' })).toThrow(/filename must not contain path separators/);
    });

    test('download helper rejects unsupported body types', () => {
        expect(() => download({ nope: true }, { filename: 'bad.bin' })).toThrow(/body must be string, Uint8Array, ArrayBuffer, or Buffer-compatible bytes/);
    });

    test('download helper rejects oversized payloads', () => {
        expect(() => download(new Uint8Array((5 * 1024 * 1024) + 1), { filename: 'huge.bin' })).toThrow(/payload exceeds/);
    });
});
