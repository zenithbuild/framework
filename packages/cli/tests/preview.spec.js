import { executeServerScript, injectSsrPayload, matchRoute } from '../dist/preview.js';

describe('preview.matchRoute', () => {
    test('deterministic precedence: static > param > catch-all', () => {
        const routes = [
            { path: '/docs/*slug', output: '/docs/catchall.html' },
            { path: '/docs/:section', output: '/docs/section.html' },
            { path: '/docs/intro', output: '/docs/intro.html' }
        ];

        const staticMatch = matchRoute('/docs/intro', routes);
        expect(staticMatch).not.toBeNull();
        expect(staticMatch.entry.path).toBe('/docs/intro');
        expect(staticMatch.params).toEqual({});

        const paramMatch = matchRoute('/docs/guides', routes);
        expect(paramMatch).not.toBeNull();
        expect(paramMatch.entry.path).toBe('/docs/:section');
        expect(paramMatch.params).toEqual({ section: 'guides' });

        const catchallMatch = matchRoute('/docs/guides/install/linux', routes);
        expect(catchallMatch).not.toBeNull();
        expect(catchallMatch.entry.path).toBe('/docs/*slug');
        expect(catchallMatch.params).toEqual({ slug: 'guides/install/linux' });
    });

    test('catch-all params normalize repeated and trailing slashes', () => {
        const routes = [
            { path: '/docs/*slug', output: '/docs/catchall.html' }
        ];
        const match = matchRoute('/docs//a///b/', routes);
        expect(match).not.toBeNull();
        expect(match.entry.path).toBe('/docs/*slug');
        expect(match.params).toEqual({ slug: 'a/b' });
    });

    test('catch-all params preserve raw encoded path semantics', () => {
        const routes = [
            { path: '/docs/*slug', output: '/docs/catchall.html' }
        ];
        const match = matchRoute('/docs/%E2%9C%93/%2Fraw', routes);
        expect(match).not.toBeNull();
        expect(match.entry.path).toBe('/docs/*slug');
        expect(match.params).toEqual({ slug: '%E2%9C%93/%2Fraw' });
    });

    test('optional catch-all matches root with empty slug', () => {
        const routes = [
            { path: '/*slug?', output: '/catchall.html' }
        ];
        const match = matchRoute('/', routes);
        expect(match).not.toBeNull();
        expect(match.entry.path).toBe('/*slug?');
        expect(match.params).toEqual({ slug: '' });
    });

    test('static route wins over optional catch-all', () => {
        const routes = [
            { path: '/*slug?', output: '/catchall.html' },
            { path: '/about', output: '/about.html' }
        ];
        const match = matchRoute('/about', routes);
        expect(match).not.toBeNull();
        expect(match.entry.path).toBe('/about');
        expect(match.params).toEqual({});
    });

    test('root required catch-all matches root with empty slug', () => {
        const routes = [
            { path: '/*slug', output: '/catchall.html' }
        ];
        const match = matchRoute('/', routes);
        expect(match).not.toBeNull();
        expect(match.entry.path).toBe('/*slug');
        expect(match.params).toEqual({ slug: '' });
    });

    test('static route still wins over root required catch-all', () => {
        const routes = [
            { path: '/*slug', output: '/catchall.html' },
            { path: '/about', output: '/about.html' }
        ];
        const match = matchRoute('/about', routes);
        expect(match).not.toBeNull();
        expect(match.entry.path).toBe('/about');
        expect(match.params).toEqual({});
    });

    test('specific docs param route wins before root catch-all, deep docs falls through', () => {
        const routes = [
            { path: '/*slug', output: '/catchall.html' },
            { path: '/docs/:section/:slug', output: '/docs/detail.html' }
        ];

        const docsDetail = matchRoute('/docs/animations/gsap-patterns', routes);
        expect(docsDetail).not.toBeNull();
        expect(docsDetail.entry.path).toBe('/docs/:section/:slug');
        expect(docsDetail.params).toEqual({ section: 'animations', slug: 'gsap-patterns' });

        const docsDeep = matchRoute('/docs/animations/gsap/patterns', routes);
        expect(docsDeep).not.toBeNull();
        expect(docsDeep.entry.path).toBe('/*slug');
        expect(docsDeep.params).toEqual({ slug: 'docs/animations/gsap/patterns' });
    });
});

describe('preview.injectSsrPayload', () => {
    test('injects inline __zenith_ssr_data script in head', () => {
        const html = '<!doctype html><html><head><title>x</title></head><body><main>ok</main></body></html>';
        const out = injectSsrPayload(html, { user: { id: 42 } });

        expect(out.includes('window.__zenith_ssr_data = {')).toBe(true);
        expect(out.includes('Object.freeze(')).toBe(false);
        expect(out.includes('</head>')).toBe(true);
        expect(out.includes('__zenith_ssr=')).toBe(false);
    });

    test('escapes script-breaking payload content', () => {
        const html = '<!doctype html><html><head></head><body></body></html>';
        const out = injectSsrPayload(html, {
            text: '</script><script>alert(1)</script>',
            lineSep: 'A\u2028B',
            paraSep: 'A\u2029B'
        });

        expect(out.includes('</script><script>alert(1)</script>')).toBe(false);
        expect(out.includes('\\u003C\\u002Fscript\\u003E\\u003Cscript\\u003Ealert(1)\\u003C\\u002Fscript\\u003E')).toBe(true);
        expect(out.includes('\\u2028')).toBe(true);
        expect(out.includes('\\u2029')).toBe(true);
        expect((out.match(/<script\b/gi) || []).length).toBe(1);
    });
});

describe('preview.executeServerScript', () => {
    test('non-serializable load return emits __zenith_error envelope', async () => {
        const payload = await executeServerScript({
            source: 'export const load = async (ctx) => ({ bad: () => {} });',
            sourcePath: '/tmp/zenith-preview-load.ts',
            params: {}
        });

        expect(payload).not.toBeNull();
        expect(payload.__zenith_error).toBeDefined();
        expect(payload.__zenith_error.code).toBe('ACCESS_DENIED');
    });

    test('load(ctx) receives route params/url/route metadata for static routes', async () => {
        const payload = await executeServerScript({
            source: 'export const load = async (ctx) => ({ params: ctx.params, url: ctx.url.pathname, route: ctx.route.pattern });',
            sourcePath: '/tmp/zenith-preview-static.ts',
            params: {},
            requestUrl: 'http://localhost/about',
            routePattern: '/about',
            routeFile: 'src/pages/about.zen',
            routeId: 'about'
        });

        expect(payload).toEqual({
            params: {},
            url: '/about',
            route: '/about'
        });
    });

    test('load(ctx) receives route params for :param and *catchall routes', async () => {
        const payload = await executeServerScript({
            source: 'export const load = async (ctx) => ({ params: ctx.params, route: ctx.route.pattern });',
            sourcePath: '/tmp/zenith-preview-dynamic.ts',
            params: { section: 'guides', slug: 'install/linux' },
            requestUrl: 'http://localhost/docs/guides/install/linux',
            routePattern: '/docs/:section/*slug',
            routeFile: 'src/pages/docs/[section]/[...slug].zen',
            routeId: 'docs/[section]/[...slug]'
        });

        expect(payload).toEqual({
            params: { section: 'guides', slug: 'install/linux' },
            route: '/docs/:section/*slug'
        });
    });
});
