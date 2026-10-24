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
        [
            'guard redirect',
            {
                guardResult: redirect('/login', 307),
                actionResult: data({ saved: true }),
                loadResult: data({ loaded: true }),
                expectedCalls: ['guard'],
                expectedTrace: { guard: 'redirect', action: 'none', load: 'none' },
                expectedResult: redirect('/login', 307)
            }
        ],
        [
            'guard deny',
            {
                guardResult: deny(401, 'sign in'),
                actionResult: data({ saved: true }),
                loadResult: data({ loaded: true }),
                expectedCalls: ['guard'],
                expectedTrace: { guard: 'deny', action: 'none', load: 'none' },
                expectedResult: deny(401, 'sign in')
            }
        ],
        [
            'action redirect',
            {
                guardResult: allow(),
                actionResult: redirect('/done', 303),
                loadResult: data({ loaded: true }),
                expectedCalls: ['guard', 'action'],
                expectedTrace: { guard: 'allow', action: 'redirect', load: 'none' },
                expectedResult: redirect('/done', 303)
            }
        ],
        [
            'action deny',
            {
                guardResult: allow(),
                actionResult: deny(403, 'blocked'),
                loadResult: data({ loaded: true }),
                expectedCalls: ['guard', 'action'],
                expectedTrace: { guard: 'allow', action: 'deny', load: 'none' },
                expectedResult: deny(403, 'blocked')
            }
        ],
        [
            'load redirect',
            {
                guardResult: allow(),
                actionResult: data({ saved: true }),
                loadResult: redirect('/after-load', 302),
                expectedCalls: ['guard', 'action', 'load'],
                expectedTrace: { guard: 'allow', action: 'data', load: 'redirect' },
                expectedResult: redirect('/after-load', 302)
            }
        ],
        [
            'load deny',
            {
                guardResult: allow(),
                actionResult: data({ saved: true }),
                loadResult: deny(404, 'missing'),
                expectedCalls: ['guard', 'action', 'load'],
                expectedTrace: { guard: 'allow', action: 'data', load: 'deny' },
                expectedResult: deny(404, 'missing')
            }
        ]
    ])('page POST %s preserves execution contract', async (_name, scenario) => {
        const calls = [];
        const result = await resolveRouteResult({
            routeKind: 'page',
            filePath: 'page.ts',
            ctx: createContext('POST'),
            exports: {
                guard(ctx) {
                    void ctx;
                    calls.push('guard');
                    return scenario.guardResult;
                },
                action(ctx) {
                    void ctx;
                    calls.push('action');
                    return scenario.actionResult;
                },
                load(ctx) {
                    void ctx;
                    calls.push('load');
                    return scenario.loadResult;
                }
            }
        });

        expect(calls).toEqual(scenario.expectedCalls);
        expect(result.result).toMatchObject(scenario.expectedResult);
        expect(result.trace).toEqual(scenario.expectedTrace);
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
