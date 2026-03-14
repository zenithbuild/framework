import { resolveRequestRoute } from '../src/server/resolve-request-route.js';

describe('resolveRequestRoute', () => {
    const manifest = [
        { path: '/docs/*slug' },
        { path: '/docs/:section' },
        { path: '/docs/getting-started' },
        { path: '/fallback/*rest?' }
    ];

    test('uses deterministic precedence: static > param > catch-all', () => {
        expect(resolveRequestRoute('http://localhost/docs/getting-started', manifest)).toEqual({
            matched: true,
            route: { path: '/docs/getting-started' },
            params: {}
        });

        expect(resolveRequestRoute('http://localhost/docs/guides', manifest)).toEqual({
            matched: true,
            route: { path: '/docs/:section' },
            params: { section: 'guides' }
        });

        expect(resolveRequestRoute('http://localhost/docs/guides/install/linux', manifest)).toEqual({
            matched: true,
            route: { path: '/docs/*slug' },
            params: { slug: 'guides/install/linux' }
        });
    });

    test('route identity is pathname-based: trailing slash and query do not change the match', () => {
        expect(resolveRequestRoute('http://localhost/docs/guides/?tab=intro', manifest)).toEqual({
            matched: true,
            route: { path: '/docs/:section' },
            params: { section: 'guides' }
        });
    });

    test('optional catch-all can match its prefix root with an empty param', () => {
        expect(resolveRequestRoute('http://localhost/fallback', manifest)).toEqual({
            matched: true,
            route: { path: '/fallback/*rest?' },
            params: { rest: '' }
        });
    });

    test('hash fragments do not participate in server route selection', () => {
        expect(resolveRequestRoute('http://localhost/docs/getting-started#install', manifest)).toEqual({
            matched: true,
            route: { path: '/docs/getting-started' },
            params: {}
        });
    });

    test('unmatched paths return null route and empty params', () => {
        expect(resolveRequestRoute('http://localhost/unknown/path', manifest)).toEqual({
            matched: false,
            route: null,
            params: {}
        });
    });
});
