import { allow, data, deny, download, invalid, json, resolveRouteResult, text, validateServerExports, withMiddleware } from '../src/server-contract.js';

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

    test('withMiddleware composes page load handlers left-to-right', async () => {
        const order = [];
        const outer = (next) => async (ctx) => {
            order.push('outer:before');
            const result = await next(ctx);
            order.push('outer:after');
            return result;
        };
        const inner = (next) => async (ctx) => {
            order.push('inner:before');
            const result = await next(ctx);
            order.push('inner:after');
            return result;
        };

        const resolved = await resolveRouteResult({
            exports: {
                load: withMiddleware(async (ctx) => {
                    void ctx;
                    order.push('handler');
                    return data({ ok: true });
                }, outer, inner)
            },
            ctx: createRouteContext('GET'),
            filePath: 'pages/example.zen'
        });

        expect(resolved).toEqual({
            result: { kind: 'data', data: { ok: true } },
            trace: { guard: 'none', action: 'none', load: 'data' },
            status: 200
        });
        expect(order).toEqual([
            'outer:before',
            'inner:before',
            'handler',
            'inner:after',
            'outer:after'
        ]);
    });

    test('withMiddleware can short-circuit guard handlers', async () => {
        const resolved = await resolveRouteResult({
            exports: {
                guard: withMiddleware(async (ctx) => {
                    void ctx;
                    return allow();
                }, () => async (ctx) => {
                    void ctx;
                    return deny(401, 'auth required');
                }),
                load: async (ctx) => {
                    void ctx;
                    return data({ ok: true });
                }
            },
            ctx: createRouteContext('GET'),
            filePath: 'pages/protected.zen'
        });

        expect(resolved).toEqual({
            result: { kind: 'deny', status: 401, message: 'auth required' },
            trace: { guard: 'deny', action: 'none', load: 'none' }
        });
    });

    test('withMiddleware can short-circuit page action handlers with invalid results', async () => {
        const resolved = await resolveRouteResult({
            exports: {
                action: withMiddleware(
                    async (ctx) => {
                        void ctx;
                        return data({ ok: true });
                    },
                    () => async (ctx) => {
                        void ctx;
                        return invalid({ error: 'Title required' }, 422);
                    }
                ),
                load: async (ctx) => data({ action: ctx.action })
            },
            ctx: createRouteContext('POST'),
            filePath: 'pages/form.zen'
        });

        expect(resolved).toEqual({
            result: {
                kind: 'data',
                data: {
                    action: {
                        ok: false,
                        status: 422,
                        data: { error: 'Title required' }
                    }
                }
            },
            trace: { guard: 'none', action: 'invalid', load: 'data' },
            status: 422
        });
    });

    test('withMiddleware composes resource handlers and preserves route result contracts', async () => {
        const resolved = await resolveRouteResult({
            exports: {
                load: withMiddleware(
                    async (ctx) => {
                        void ctx;
                        return json({ ok: true });
                    },
                    () => async (ctx) => {
                        void ctx;
                        return deny(403, 'session required');
                    }
                )
            },
            ctx: createRouteContext('GET'),
            filePath: 'pages/api/example.resource.ts',
            routeKind: 'resource'
        });

        expect(resolved).toEqual({
            result: { kind: 'deny', status: 403, message: 'session required' },
            trace: { guard: 'none', action: 'none', load: 'deny' },
            status: 403
        });
    });

    test('withMiddleware remains import-only and is not injected onto ctx', async () => {
        const resolved = await resolveRouteResult({
            exports: {
                load: async (ctx) => json({ hasCtxMiddlewareHelper: typeof ctx.withMiddleware !== 'undefined' })
            },
            ctx: createRouteContext('GET'),
            filePath: 'pages/api/example.resource.ts',
            routeKind: 'resource'
        });

        expect(resolved.result).toEqual({
            kind: 'json',
            data: { hasCtxMiddlewareHelper: false },
            status: 200
        });
    });

    test('withMiddleware validates handler and middleware function shapes', () => {
        expect(() => withMiddleware(null)).toThrow('handler must be a function');
        expect(() => withMiddleware(async (ctx) => {
            void ctx;
            return data({ ok: true });
        }, null)).toThrow('middleware at index 0 must be a function');
        expect(() => withMiddleware(async (ctx) => {
            void ctx;
            return data({ ok: true });
        }, () => null)).toThrow('middleware at index 0 must return a function');
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
