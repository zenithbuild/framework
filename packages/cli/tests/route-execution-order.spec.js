import {
    allow,
    data,
    deny,
    redirect,
    resolveRouteResult
} from '../dist/server-contract.js';

function createContext(method = 'GET') {
    return {
        method,
        request: { method },
        url: new URL('http://localhost/protected')
    };
}

describe('route guard/load execution order', () => {
    test.each([
        ['page redirect', 'page', redirect('/login', 307)],
        ['page deny', 'page', deny(401, 'nope')],
        ['resource redirect', 'resource', redirect('/login', 307)],
        ['resource deny', 'resource', deny(401, 'nope')]
    ])('%s guard short-circuits later stages', async (_name, routeKind, guardResult) => {
        const calls = [];
        const result = await resolveRouteResult({
            routeKind,
            filePath: `${routeKind}.ts`,
            ctx: createContext(),
            exports: {
                guard(ctx) {
                    calls.push(`guard:${ctx.url.pathname}`);
                    return guardResult;
                },
                load(ctx) {
                    calls.push(`load:${ctx.url.pathname}`);
                    return routeKind === 'resource' ? ctx.text('loaded') : data({ loaded: true });
                }
            }
        });

        expect(calls).toEqual(['guard:/protected']);
        expect(result.result).toMatchObject(guardResult);
        expect(result.trace).toEqual({ guard: guardResult.kind, action: 'none', load: 'none' });
    });

    test.each([
        ['page', { guard: 'allow', action: 'none', load: 'none' }],
        ['resource', { guard: 'allow', action: 'none', load: 'none' }]
    ])('%s guardOnly runs guard and skips load', async (routeKind, expectedTrace) => {
        const calls = [];
        const result = await resolveRouteResult({
            routeKind,
            guardOnly: true,
            filePath: `${routeKind}.ts`,
            ctx: createContext(),
            exports: {
                guard(ctx) {
                    calls.push(`guard:${ctx.url.pathname}`);
                    return allow();
                },
                load(ctx) {
                    calls.push(`load:${ctx.url.pathname}`);
                    return routeKind === 'resource' ? ctx.text('loaded') : data({ loaded: true });
                }
            }
        });

        expect(calls).toEqual(['guard:/protected']);
        expect(result.result).toEqual(allow());
        expect(result.trace).toEqual(expectedTrace);
    });

    test('page POST action runs after guard and before load', async () => {
        const calls = [];
        const result = await resolveRouteResult({
            routeKind: 'page',
            filePath: 'page.ts',
            ctx: createContext('POST'),
            exports: {
                guard(ctx) {
                    calls.push(`guard:${ctx.method}`);
                    return allow();
                },
                action(ctx) {
                    calls.push(`action:${ctx.action === null}`);
                    return data({ saved: true });
                },
                load(ctx) {
                    calls.push(`load:${ctx.action.ok}`);
                    return data({ action: ctx.action });
                }
            }
        });

        expect(calls).toEqual(['guard:POST', 'action:true', 'load:true']);
        expect(result.result).toEqual(data({ action: { ok: true, status: 200, data: { saved: true } } }));
        expect(result.trace).toEqual({ guard: 'allow', action: 'data', load: 'data' });
    });

    test.each([
        ['redirect', redirect('/next', 303)],
        ['deny', deny(403, 'blocked')]
    ])('page load %s result is preserved', async (_name, loadResult) => {
        const result = await resolveRouteResult({
            routeKind: 'page',
            filePath: 'page.ts',
            ctx: createContext(),
            exports: {
                guard(ctx) {
                    void ctx;
                    return allow();
                },
                load(ctx) {
                    void ctx;
                    return loadResult;
                }
            }
        });

        expect(result.result).toMatchObject(loadResult);
        expect(result.trace).toEqual({ guard: 'allow', action: 'none', load: loadResult.kind });
    });
});
