
import { allow, data, deny, redirect, resolveRouteResult, resolveServerPayload, validateServerExports } from '../src/server-contract.js';

describe('Server Contract Validation and Payload Resolution', () => {

    describe('validateServerExports', () => {
        test('allows new data export', () => {
            expect(() => validateServerExports({
                exports: { data: { foo: 'bar' } },
                filePath: 'test.zen'
            })).not.toThrow();
        });

        test('allows new load() export', () => {
            expect(() => validateServerExports({
                exports: { load: async (ctx) => ({}) },
                filePath: 'test.zen'
            })).not.toThrow();
        });

        test('prevents exporting both data and load', () => {
            expect(() => validateServerExports({
                exports: { data: {}, load: async (ctx) => ({}) },
                filePath: 'test.zen'
            })).toThrow(/cannot export both "data" and "load"/);
        });

        test('prevents mixing new and legacy exports', () => {
            expect(() => validateServerExports({
                exports: { data: {}, ssr_data: {} },
                filePath: 'test.zen'
            })).toThrow(/cannot mix new .* with legacy/);

            expect(() => validateServerExports({
                exports: { load: async (ctx) => ({}), props: {} },
                filePath: 'test.zen'
            })).toThrow(/cannot mix new .* with legacy/);
        });

        test('ensures load is a function taking exactly 1 argument', () => {
            expect(() => validateServerExports({
                exports: { load: 'not a function' },
                filePath: 'test.zen'
            })).toThrow(/"load" must be a function/);

            expect(() => validateServerExports({
                exports: { load: () => ({}) },
                filePath: 'test.zen'
            })).toThrow(/"load\(ctx\)" must take exactly 1 argument/);

            expect(() => validateServerExports({
                exports: { load: async (ctx, extra) => ({}) },
                filePath: 'test.zen'
            })).toThrow(/"load\(ctx\)" must take exactly 1 argument/);

            expect(() => validateServerExports({
                exports: { load: async (...args) => ({}) },
                filePath: 'test.zen'
            })).toThrow(/"load\(ctx\)" must take exactly 1 argument/);

            expect(() => validateServerExports({
                exports: { load: async (ctx = {}) => ({}) },
                filePath: 'test.zen'
            })).toThrow(/"load\(ctx\)" must take exactly 1 argument/);
        });

        test('prevents unknown exports', () => {
            expect(() => validateServerExports({
                exports: { load: async (ctx) => ({}), secret: '123' },
                filePath: 'test.zen'
            })).toThrow(/illegal export\(s\): secret/);
        });
    });

    describe('resolveServerPayload & strict JSON serialization', () => {
        const ctx = {
            params: {},
            url: new URL('http://localhost'),
            request: new Request('http://localhost'),
            route: { id: 'x', file: 'x', pattern: 'x' }
        };

        test('resolves load payload', async () => {
            const payload = await resolveServerPayload({
                exports: { load: async (c) => ({ paramCount: Object.keys(c.params).length }) },
                ctx,
                filePath: 'test.zen'
            });
            expect(payload).toEqual({ paramCount: 0 });
        });

        test('resolves data payload', async () => {
            const payload = await resolveServerPayload({
                exports: { data: { success: true } },
                ctx,
                filePath: 'test.zen'
            });
            expect(payload).toEqual({ success: true });
        });

        test('resolves legacy ssr_data', async () => {
            const payload = await resolveServerPayload({
                exports: { ssr_data: { legacy: true } },
                ctx,
                filePath: 'test.zen'
            });
            expect(payload).toEqual({ legacy: true });
        });

        test('throws on standard non-serializable values', async () => {
            await expect(resolveServerPayload({
                exports: { data: { func: () => { } } }, ctx, filePath: 'test.zen'
            })).rejects.toThrow(/non-serializable function at \$\.func/);

            await expect(resolveServerPayload({
                exports: { data: { sym: Symbol('x') } }, ctx, filePath: 'test.zen'
            })).rejects.toThrow(/non-serializable symbol at \$\.sym/);

            await expect(resolveServerPayload({
                exports: { data: { big: 1n } }, ctx, filePath: 'test.zen'
            })).rejects.toThrow(/non-serializable bigint at \$\.big/);
        });

        test('throws on undefined (to prevent JSON swallowing)', async () => {
            await expect(resolveServerPayload({
                exports: { data: { missing: undefined } }, ctx, filePath: 'test.zen'
            })).rejects.toThrow(/undefined is not allowed at \$\.missing/);
        });

        test('throws on complex instances', async () => {
            await expect(resolveServerPayload({
                exports: { data: { d: new Date() } }, ctx, filePath: 'test.zen'
            })).rejects.toThrow(/Date is not allowed at \$\.d/);

            await expect(resolveServerPayload({
                exports: { data: { s: new Set() } }, ctx, filePath: 'test.zen'
            })).rejects.toThrow(/Map\/Set not allowed at \$\.s/);
        });

        test('throws on circular references', async () => {
            const circular = {};
            circular.self = circular;

            await expect(resolveServerPayload({
                exports: { data: circular }, ctx, filePath: 'test.zen'
            })).rejects.toThrow(/circular reference/);
        });

        test('throws on top-level array payload', async () => {
            await expect(resolveServerPayload({
                exports: { data: [] }, ctx, filePath: 'test.zen'
            })).rejects.toThrow(/top-level payload must be a plain object, not an array/);
        });

        test('throws on prototype pollution keys', async () => {
            await expect(resolveServerPayload({
                exports: { data: JSON.parse('{"__proto__":{}}') }, ctx, filePath: 'test.zen'
            })).rejects.toThrow(/forbidden prototype pollution key "__proto__"/);

            await expect(resolveServerPayload({
                exports: { data: { constructor: 'fn' } }, ctx, filePath: 'test.zen'
            })).rejects.toThrow(/forbidden prototype pollution key "constructor"/);
        });
    });

    describe('resolveRouteResult', () => {
        const ctx = {
            params: { id: '42' },
            url: new URL('http://localhost/users/42?tab=profile'),
            request: new Request('http://localhost/users/42?tab=profile'),
            route: { id: 'users/[id]', file: 'users/[id].zen', pattern: '/users/:id' },
            env: {}
        };

        test('runs guard before load and passes env mutations through', async () => {
            const calls = [];
            const resolved = await resolveRouteResult({
                exports: {
                    guard: async (incomingCtx) => {
                        calls.push(`guard:${incomingCtx.params.id}`);
                        incomingCtx.env.role = 'admin';
                        return allow();
                    },
                    load: async (incomingCtx) => {
                        calls.push(`load:${incomingCtx.env.role}`);
                        return data({ ok: true, role: incomingCtx.env.role });
                    }
                },
                ctx: { ...ctx, env: {} },
                filePath: 'users/[id].zen'
            });

            expect(calls).toEqual(['guard:42', 'load:admin']);
            expect(resolved).toEqual({
                result: { kind: 'data', data: { ok: true, role: 'admin' } },
                trace: { guard: 'allow', load: 'data' }
            });
        });

        test('guard redirect short-circuits load', async () => {
            let loadCalls = 0;
            const resolved = await resolveRouteResult({
                exports: {
                    guard: async (_ctx) => redirect('/login?next=%2Fusers%2F42', 307),
                    load: async (_ctx) => {
                        loadCalls += 1;
                        return { ok: true };
                    }
                },
                ctx: { ...ctx, env: {} },
                filePath: 'users/[id].zen'
            });

            expect(loadCalls).toBe(0);
            expect(resolved).toEqual({
                result: { kind: 'redirect', location: '/login?next=%2Fusers%2F42', status: 307 },
                trace: { guard: 'redirect', load: 'none' }
            });
        });

        test('guard deny short-circuits load', async () => {
            let loadCalls = 0;
            const resolved = await resolveRouteResult({
                exports: {
                    guard: async (_ctx) => deny(403, 'Admins only'),
                    load: async (_ctx) => {
                        loadCalls += 1;
                        return { ok: true };
                    }
                },
                ctx: { ...ctx, env: {} },
                filePath: 'users/[id].zen'
            });

            expect(loadCalls).toBe(0);
            expect(resolved).toEqual({
                result: { kind: 'deny', status: 403, message: 'Admins only' },
                trace: { guard: 'deny', load: 'none' }
            });
        });

        test('load plain objects are wrapped as data results', async () => {
            const resolved = await resolveRouteResult({
                exports: {
                    load: async (incomingCtx) => ({ id: incomingCtx.params.id, tab: incomingCtx.url.searchParams.get('tab') })
                },
                ctx: { ...ctx, env: {} },
                filePath: 'users/[id].zen'
            });

            expect(resolved).toEqual({
                result: { kind: 'data', data: { id: '42', tab: 'profile' } },
                trace: { guard: 'none', load: 'data' }
            });
        });

        test('load can return route-level 404 deny', async () => {
            const resolved = await resolveRouteResult({
                exports: {
                    load: async (_ctx) => deny(404, 'Record not found')
                },
                ctx: { ...ctx, env: {} },
                filePath: 'users/[id].zen'
            });

            expect(resolved).toEqual({
                result: { kind: 'deny', status: 404, message: 'Record not found' },
                trace: { guard: 'none', load: 'deny' }
            });
        });

        test('guard-only mode executes guard and skips load', async () => {
            let loadCalls = 0;
            const resolved = await resolveRouteResult({
                exports: {
                    guard: async (_ctx) => allow(),
                    load: async (_ctx) => {
                        loadCalls += 1;
                        return { ok: true };
                    }
                },
                ctx: { ...ctx, env: {} },
                filePath: 'users/[id].zen',
                guardOnly: true
            });

            expect(loadCalls).toBe(0);
            expect(resolved).toEqual({
                result: { kind: 'allow' },
                trace: { guard: 'allow', load: 'none' }
            });
        });
    });

});
