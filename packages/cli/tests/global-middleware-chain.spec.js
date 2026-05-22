import {
    attachRouteAuth,
    SESSION_COOKIE_NAME,
    SESSION_SECRET_ENV
} from '../src/auth/route-auth.js';
import {
    allow,
    data,
    deny,
    download,
    invalid,
    json,
    redirect,
    text
} from '../src/server-contract.js';
import { executeMatchedRoutePipeline } from '../src/server-runtime/matched-route-pipeline.js';

const UNSUPPORTED_RESULT_ERROR =
    'Global middleware may only continue with next() or short-circuit with redirect() / deny() in V1.';
const DOUBLE_NEXT_ERROR = 'Global middleware called next() more than once.';
const POST_NEXT_OVERRIDE_ERROR =
    'Global middleware cannot override the route result after next() in V1.';

function createRouteContext({ method = 'GET', url = 'http://localhost/protected', guardOnly = false } = {}) {
    const request = new Request(url, { method });
    const ctx = {
        params: { id: '42' },
        url: new URL(url),
        headers: Object.fromEntries(request.headers.entries()),
        cookies: {},
        request,
        method,
        route: {
            id: 'test-route',
            pattern: '/protected',
            file: 'protected.zen'
        },
        env: {},
        action: null,
        allow,
        redirect,
        deny,
        invalid,
        data,
        json,
        text,
        download
    };

    attachRouteAuth(ctx, {
        requestUrl: ctx.url,
        guardOnly,
        redirect,
        deny
    });
    return ctx;
}

function pageExports(calls = []) {
    return {
        guard: async (ctx) => {
            calls.push('guard');
            ctx.env.guard = 'allowed';
            return ctx.allow();
        },
        load: async (ctx) => {
            calls.push('load');
            return ctx.data({
                ok: true,
                guard: ctx.env.guard,
                middleware: ctx.env.middleware || null
            });
        }
    };
}

function pagePostExports(calls = []) {
    return {
        guard: async (ctx) => {
            calls.push('guard');
            return ctx.allow();
        },
        action: async (ctx) => {
            calls.push('action');
            return ctx.data({ posted: true });
        },
        load: async (ctx) => {
            calls.push('load');
            return ctx.data({ action: ctx.action });
        }
    };
}

async function executePipeline({
    exports = pageExports(),
    ctx = createRouteContext(),
    routeKind = 'page',
    globalMiddleware = null,
    guardOnly = false
} = {}) {
    return executeMatchedRoutePipeline({
        exports,
        ctx,
        filePath: 'protected.zen',
        guardOnly,
        routeKind,
        globalMiddleware
    });
}

describe('global middleware chain Gate 2', () => {
    const previousSecret = process.env[SESSION_SECRET_ENV];

    afterEach(() => {
        if (previousSecret === undefined) {
            delete process.env[SESSION_SECRET_ENV];
            return;
        }
        process.env[SESSION_SECRET_ENV] = previousSecret;
    });

    test('null middleware delegates unchanged to resolveRouteResult behavior', async () => {
        const calls = [];
        const resolved = await executePipeline({
            exports: pageExports(calls),
            globalMiddleware: null
        });

        expect(calls).toEqual(['guard', 'load']);
        expect(resolved).toEqual({
            result: {
                kind: 'data',
                data: {
                    ok: true,
                    guard: 'allowed',
                    middleware: null
                }
            },
            trace: { guard: 'allow', action: 'none', load: 'data' },
            status: 200
        });
    });

    test('return next() returns the normal route envelope', async () => {
        const resolved = await executePipeline({
            globalMiddleware: async (_ctx, next) => next()
        });

        expect(resolved.trace).toEqual({ guard: 'allow', action: 'none', load: 'data' });
        expect(resolved.status).toBe(200);
        expect(resolved.result).toEqual({
            kind: 'data',
            data: {
                ok: true,
                guard: 'allowed',
                middleware: null
            }
        });
    });

    test('await next() with no explicit return returns the captured route envelope', async () => {
        const resolved = await executePipeline({
            globalMiddleware: async (_ctx, next) => {
                await next();
            }
        });

        expect(resolved).toEqual({
            result: {
                kind: 'data',
                data: {
                    ok: true,
                    guard: 'allowed',
                    middleware: null
                }
            },
            trace: { guard: 'allow', action: 'none', load: 'data' },
            status: 200
        });
    });

    test('returning the exact captured next() envelope is allowed', async () => {
        const resolved = await executePipeline({
            globalMiddleware: async (_ctx, next) => {
                const result = await next();
                return result;
            }
        });

        expect(resolved.trace).toEqual({ guard: 'allow', action: 'none', load: 'data' });
        expect(resolved.status).toBe(200);
        expect(resolved.result.kind).toBe('data');
    });

    test('middleware runs before guard and can pass data through ctx.env', async () => {
        const resolved = await executePipeline({
            globalMiddleware: async (ctx, next) => {
                ctx.env.middleware = 'before-guard';
                return next();
            }
        });

        expect(resolved.result).toEqual({
            kind: 'data',
            data: {
                ok: true,
                guard: 'allowed',
                middleware: 'before-guard'
            }
        });
        expect(resolved.trace).toEqual({ guard: 'allow', action: 'none', load: 'data' });
    });

    test('resource route through next() preserves resource trace and status', async () => {
        const resolved = await executePipeline({
            routeKind: 'resource',
            exports: {
                load: async (ctx) => ctx.json({ ok: true })
            },
            globalMiddleware: async (_ctx, next) => next()
        });

        expect(resolved).toEqual({
            result: { kind: 'json', data: { ok: true }, status: 200 },
            trace: { guard: 'none', action: 'none', load: 'json' },
            status: 200
        });
    });

    test('calling next() twice rejects', async () => {
        await expect(executePipeline({
            globalMiddleware: async (_ctx, next) => {
                await next();
                return next();
            }
        })).rejects.toThrow(DOUBLE_NEXT_ERROR);
    });

    test('returning redirect after next() rejects as a post-next override', async () => {
        await expect(executePipeline({
            globalMiddleware: async (ctx, next) => {
                await next();
                return ctx.redirect('/late');
            }
        })).rejects.toThrow(POST_NEXT_OVERRIDE_ERROR);
    });

    test('returning deny after next() rejects as a post-next override', async () => {
        await expect(executePipeline({
            globalMiddleware: async (ctx, next) => {
                await next();
                return ctx.deny(403, 'late');
            }
        })).rejects.toThrow(POST_NEXT_OVERRIDE_ERROR);
    });

    test('returning a plain object after next() rejects as a post-next override', async () => {
        await expect(executePipeline({
            globalMiddleware: async (_ctx, next) => {
                await next();
                return { ok: true };
            }
        })).rejects.toThrow(POST_NEXT_OVERRIDE_ERROR);
    });

    test('redirect before next() short-circuits and prevents route stages', async () => {
        const calls = [];
        const resolved = await executePipeline({
            ctx: createRouteContext({ method: 'POST' }),
            exports: pagePostExports(calls),
            globalMiddleware: async (ctx) => ctx.redirect('/login')
        });

        expect(calls).toEqual([]);
        expect(resolved).toEqual({
            result: { kind: 'redirect', location: '/login', status: 302 },
            trace: { guard: 'none', action: 'none', load: 'none' }
        });
    });

    test('deny before next() short-circuits and prevents route stages', async () => {
        const calls = [];
        const resolved = await executePipeline({
            ctx: createRouteContext({ method: 'POST' }),
            exports: pagePostExports(calls),
            globalMiddleware: async (ctx) => ctx.deny(403, 'Forbidden')
        });

        expect(calls).toEqual([]);
        expect(resolved).toEqual({
            result: { kind: 'deny', status: 403, message: 'Forbidden' },
            trace: { guard: 'none', action: 'none', load: 'none' }
        });
    });

    test.each([
        ['ctx.allow()', (ctx) => ctx.allow()],
        ['ctx.data({})', (ctx) => ctx.data({})],
        ['ctx.invalid({})', (ctx) => ctx.invalid({})],
        ['ctx.json({})', (ctx) => ctx.json({})],
        ['ctx.text("x")', (ctx) => ctx.text('x')],
        ['ctx.download("x", { filename: "x.txt" })', (ctx) => ctx.download('x', { filename: 'x.txt' })],
        ['plain object', () => ({ ok: true })],
        ['undefined without next', () => undefined],
        ...(typeof Response === 'function'
            ? [['Response', () => new Response('x')]]
            : [])
    ])('unsupported middleware return rejects: %s', async (_label, createReturnValue) => {
        await expect(executePipeline({
            globalMiddleware: async (ctx) => createReturnValue(ctx)
        })).rejects.toThrow(UNSUPPORTED_RESULT_ERROR);
    });

    test('auth requireSession redirect in middleware becomes redirect instead of a 500', async () => {
        process.env[SESSION_SECRET_ENV] = 'zenith-global-middleware-auth-secret';

        const resolved = await executePipeline({
            globalMiddleware: async (ctx, next) => {
                await ctx.auth.requireSession({ redirectTo: '/login' });
                return next();
            }
        });

        expect(resolved).toEqual({
            result: { kind: 'redirect', location: '/login', status: 302 },
            trace: { guard: 'none', action: 'none', load: 'none' }
        });
    });

    test('auth requireSession numeric deny in middleware becomes deny instead of a 500', async () => {
        process.env[SESSION_SECRET_ENV] = 'zenith-global-middleware-auth-secret';

        const resolved = await executePipeline({
            globalMiddleware: async (ctx, next) => {
                await ctx.auth.requireSession({ deny: 401, message: 'Sign in required' });
                return next();
            }
        });

        expect(resolved).toEqual({
            result: { kind: 'deny', status: 401, message: 'Sign in required' },
            trace: { guard: 'none', action: 'none', load: 'none' }
        });
    });

    test('middleware signIn followed by redirect includes staged session cookie', async () => {
        process.env[SESSION_SECRET_ENV] = 'zenith-global-middleware-cookie-secret';

        const resolved = await executePipeline({
            globalMiddleware: async (ctx) => {
                await ctx.auth.signIn({ userId: 'u1' });
                return ctx.redirect('/dashboard');
            }
        });

        expect(resolved.result).toEqual({ kind: 'redirect', location: '/dashboard', status: 302 });
        expect(resolved.trace).toEqual({ guard: 'none', action: 'none', load: 'none' });
        expect(resolved.setCookies).toHaveLength(1);
        expect(resolved.setCookies[0]).toContain(`${SESSION_COOKIE_NAME}=`);
        expect(resolved.setCookies[0]).toContain('HttpOnly');
        expect(resolved.setCookies[0]).toContain('SameSite=Lax');
    });

    test('middleware signOut followed by redirect includes staged clearing cookie', async () => {
        process.env[SESSION_SECRET_ENV] = 'zenith-global-middleware-cookie-secret';

        const resolved = await executePipeline({
            globalMiddleware: async (ctx) => {
                await ctx.auth.signOut();
                return ctx.redirect('/login');
            }
        });

        expect(resolved.result).toEqual({ kind: 'redirect', location: '/login', status: 302 });
        expect(resolved.trace).toEqual({ guard: 'none', action: 'none', load: 'none' });
        expect(resolved.setCookies).toHaveLength(1);
        expect(resolved.setCookies[0]).toContain(`${SESSION_COOKIE_NAME}=;`);
        expect(resolved.setCookies[0]).toContain('Max-Age=0');
        expect(resolved.setCookies[0]).toContain('Thu, 01 Jan 1970 00:00:00 GMT');
    });
});
