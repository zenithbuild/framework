// ---------------------------------------------------------------------------
// match.spec.js — Path matching tests
// ---------------------------------------------------------------------------

import { matchPath, matchRoute } from '../src/match.js';

describe('matchPath', () => {
    test('exact root match', () => {
        const result = matchPath('/', '/');
        expect(result.matched).toBe(true);
        expect(result.params).toEqual({});
    });

    test('exact static path match', () => {
        const result = matchPath('/about', '/about');
        expect(result.matched).toBe(true);
        expect(result.params).toEqual({});
    });

    test('exact nested static path match', () => {
        const result = matchPath('/docs/api/reference', '/docs/api/reference');
        expect(result.matched).toBe(true);
        expect(result.params).toEqual({});
    });

    test('no match on different segment', () => {
        const result = matchPath('/about', '/contact');
        expect(result.matched).toBe(false);
    });

    test('no match on different segment count', () => {
        const result = matchPath('/users/:id', '/users');
        expect(result.matched).toBe(false);
    });

    test('no match on extra trailing segment', () => {
        const result = matchPath('/users', '/users/123');
        expect(result.matched).toBe(false);
    });

    test('single param extraction', () => {
        const result = matchPath('/users/:id', '/users/42');
        expect(result.matched).toBe(true);
        expect(result.params).toEqual({ id: '42' });
    });

    test('multiple param extraction', () => {
        const result = matchPath('/users/:userId/posts/:postId', '/users/7/posts/99');
        expect(result.matched).toBe(true);
        expect(result.params).toEqual({ userId: '7', postId: '99' });
    });

    test('params are always strings', () => {
        const result = matchPath('/items/:id', '/items/123');
        expect(result.matched).toBe(true);
        expect(typeof result.params.id).toBe('string');
    });

    test('param with special characters in value', () => {
        const result = matchPath('/search/:query', '/search/hello%20world');
        expect(result.matched).toBe(true);
        expect(result.params).toEqual({ query: 'hello%20world' });
    });

    test('trailing slash normalization', () => {
        const result = matchPath('/about/', '/about');
        expect(result.matched).toBe(true);
    });

    test('empty path segments are filtered', () => {
        const result = matchPath('//about//', '/about');
        expect(result.matched).toBe(true);
    });

    test('catch-all extraction joins remaining segments', () => {
        const result = matchPath('/docs/*slug', '/docs/getting-started/installation');
        expect(result.matched).toBe(true);
        expect(result.params).toEqual({ slug: 'getting-started/installation' });
    });

    test('catch-all normalization collapses duplicate and trailing slashes', () => {
        const result = matchPath('/docs/*slug', '/docs//a///b/');
        expect(result.matched).toBe(true);
        expect(result.params).toEqual({ slug: 'a/b' });
    });

    test('catch-all preserves raw encoded path segments', () => {
        const result = matchPath('/docs/*slug', '/docs/%E2%9C%93/%2Fraw');
        expect(result.matched).toBe(true);
        expect(result.params).toEqual({ slug: '%E2%9C%93/%2Fraw' });
    });

    test('catch-all requires at least one segment', () => {
        const result = matchPath('/docs/*slug', '/docs');
        expect(result.matched).toBe(false);
    });

    test('catch-all must be terminal', () => {
        const result = matchPath('/docs/*slug/meta', '/docs/a/b/meta');
        expect(result.matched).toBe(false);
    });

    test('optional catch-all matches empty remainder', () => {
        const result = matchPath('/*slug?', '/');
        expect(result.matched).toBe(true);
        expect(result.params).toEqual({ slug: '' });
    });

    test('root required catch-all also matches empty remainder', () => {
        const result = matchPath('/*slug', '/');
        expect(result.matched).toBe(true);
        expect(result.params).toEqual({ slug: '' });
    });
});

describe('matchRoute', () => {
    const routes = [
        { path: '/', load: () => { } },
        { path: '/about', load: () => { } },
        { path: '/users/new', load: () => { } },
        { path: '/users/:id', load: () => { } },
        { path: '/posts/:id/comments/:commentId', load: () => { } },
        { path: '/docs/*slug', load: () => { } }
    ];

    test('matches root route', () => {
        const result = matchRoute(routes, '/');
        expect(result).not.toBeNull();
        expect(result.route.path).toBe('/');
        expect(result.params).toEqual({});
    });

    test('matches static route', () => {
        const result = matchRoute(routes, '/about');
        expect(result).not.toBeNull();
        expect(result.route.path).toBe('/about');
    });

    test('static route beats dynamic (ordering)', () => {
        const result = matchRoute(routes, '/users/new');
        expect(result).not.toBeNull();
        expect(result.route.path).toBe('/users/new');
        expect(result.params).toEqual({});
    });

    test('dynamic route extracts params', () => {
        const result = matchRoute(routes, '/users/42');
        expect(result).not.toBeNull();
        expect(result.route.path).toBe('/users/:id');
        expect(result.params).toEqual({ id: '42' });
    });

    test('nested params extraction', () => {
        const result = matchRoute(routes, '/posts/5/comments/12');
        expect(result).not.toBeNull();
        expect(result.params).toEqual({ id: '5', commentId: '12' });
    });

    test('returns null for unmatched path', () => {
        const result = matchRoute(routes, '/nonexistent');
        expect(result).toBeNull();
    });

    test('returns null for empty routes array', () => {
        const result = matchRoute([], '/anything');
        expect(result).toBeNull();
    });

    test('first-match-wins determinism', () => {
        const ambiguous = [
            { path: '/a/:x', load: () => { } },
            { path: '/a/:y', load: () => { } }
        ];
        const result = matchRoute(ambiguous, '/a/1');
        expect(result).not.toBeNull();
        expect(result.route.path).toBe('/a/:x');
        expect(result.params).toEqual({ x: '1' });
    });

    test('route precedence is independent of declaration order', () => {
        const ambiguous = [
            { path: '/docs/*slug', load: () => { } },
            { path: '/docs/:section', load: () => { } },
            { path: '/docs/intro', load: () => { } }
        ];
        const result = matchRoute(ambiguous, '/docs/intro');
        expect(result).not.toBeNull();
        expect(result.route.path).toBe('/docs/intro');
        expect(result.params).toEqual({});
    });

    test('catch-all matches when no static/param route applies', () => {
        const result = matchRoute(routes, '/docs/animations/gsap-patterns');
        expect(result).not.toBeNull();
        expect(result.route.path).toBe('/docs/*slug');
        expect(result.params).toEqual({ slug: 'animations/gsap-patterns' });
    });

    test('optional catch-all supports root while preserving static precedence', () => {
        const resultRoot = matchRoute(
            [
                { path: '/*slug?', load: () => { } },
                { path: '/about', load: () => { } }
            ],
            '/'
        );
        expect(resultRoot).not.toBeNull();
        expect(resultRoot.route.path).toBe('/*slug?');
        expect(resultRoot.params).toEqual({ slug: '' });

        const resultStatic = matchRoute(
            [
                { path: '/*slug?', load: () => { } },
                { path: '/about', load: () => { } }
            ],
            '/about'
        );
        expect(resultStatic).not.toBeNull();
        expect(resultStatic.route.path).toBe('/about');
        expect(resultStatic.params).toEqual({});
    });

    test('root required catch-all supports root while preserving static precedence', () => {
        const resultRoot = matchRoute(
            [
                { path: '/*slug', load: () => { } },
                { path: '/about', load: () => { } }
            ],
            '/'
        );
        expect(resultRoot).not.toBeNull();
        expect(resultRoot.route.path).toBe('/*slug');
        expect(resultRoot.params).toEqual({ slug: '' });

        const resultStatic = matchRoute(
            [
                { path: '/*slug', load: () => { } },
                { path: '/about', load: () => { } }
            ],
            '/about'
        );
        expect(resultStatic).not.toBeNull();
        expect(resultStatic.route.path).toBe('/about');
        expect(resultStatic.params).toEqual({});
    });

    test('specific docs param route wins before root catch-all, deep docs falls through', () => {
        const routes = [
            { path: '/*slug', load: () => { } },
            { path: '/docs/:section/:slug', load: () => { } }
        ];

        const docsDetail = matchRoute(routes, '/docs/animations/gsap-patterns');
        expect(docsDetail).not.toBeNull();
        expect(docsDetail.route.path).toBe('/docs/:section/:slug');
        expect(docsDetail.params).toEqual({ section: 'animations', slug: 'gsap-patterns' });

        const docsDeep = matchRoute(routes, '/docs/animations/gsap/patterns');
        expect(docsDeep).not.toBeNull();
        expect(docsDeep.route.path).toBe('/*slug');
        expect(docsDeep.params).toEqual({ slug: 'docs/animations/gsap/patterns' });
    });
});
