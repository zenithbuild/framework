import {
    createNetlifyBasePathAssetRules,
    createNetlifyImageEndpointRule,
    createNetlifyRewriteRules,
    createVercelBasePathAssetRoutes,
    createVercelImageEndpointRoute,
    createVercelRouteSource
} from '../dist/adapters/route-rules.js';

describe('adapter route rule helpers', () => {
    test('preserve hosted Vercel route source shapes', () => {
        expect(createVercelRouteSource('/')).toBe('^/?$');
        expect(createVercelRouteSource('/account', '/docs')).toBe('^/docs/account/?$');
        expect(createVercelRouteSource('/guides/:slug', '/docs')).toBe('^/docs/guides/([^/]+)/?$');
        expect(createVercelRouteSource('/docs/*rest?', '/base')).toBe('^/base/docs(?:/(.*))?/?$');
        expect(createVercelRouteSource('/files/*path', '/base')).toBe('^/base/files/(.+)/?$');
        expect(createVercelImageEndpointRoute('/docs')).toEqual({
            src: '^/docs/_zenith/image/?$',
            dest: '/__zenith/image'
        });
    });

    test('preserve hosted Netlify rewrite rule shapes', () => {
        expect(createNetlifyRewriteRules({ path: '/', html: '/index.html' }, '/docs')).toEqual([
            '/docs /index.html 200'
        ]);
        expect(createNetlifyRewriteRules({ path: '/guides/:slug', html: '/guides/__param_slug/index.html' }, '/docs')).toEqual([
            '/docs/guides/:slug /guides/__param_slug/index.html 200'
        ]);
        expect(createNetlifyRewriteRules({ path: '/docs/*rest?', html: '/docs/__splat_rest/index.html' }, '/base')).toEqual([
            '/base/docs /docs/__splat_rest/index.html 200',
            '/base/docs/* /docs/__splat_rest/index.html 200'
        ]);
        expect(createNetlifyRewriteRules({ path: '/files/*path', html: '/files/__splat_path/index.html' }, '/base')).toEqual([
            '/base/files/* /files/__splat_path/index.html 200'
        ]);
        expect(createNetlifyImageEndpointRule('/docs')).toBe('/docs/_zenith/image /.netlify/functions/__zenith_image 200!');
    });

    test('preserve basePath asset forwarding without duplicating packaged assets', () => {
        expect(createVercelBasePathAssetRoutes('/docs')).toEqual([
            { src: '^/docs/assets/(.+)$', dest: '/assets/$1' },
            { src: '^/docs/_zenith/image/local/(.+)$', dest: '/_zenith/image/local/$1' }
        ]);
        expect(createNetlifyBasePathAssetRules('/docs')).toEqual([
            '/docs/assets/* /assets/:splat 200',
            '/docs/_zenith/image/local/* /_zenith/image/local/:splat 200'
        ]);
        expect(createVercelBasePathAssetRoutes('/')).toEqual([]);
        expect(createNetlifyBasePathAssetRules('/')).toEqual([]);
    });
});
