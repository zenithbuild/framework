import {
    classifyHostedBuiltInTarget,
    createHostedAdapterContext
} from '../dist/adapters/hosted-adapter-context.js';

function createManifestFixtures() {
    const buildManifest = {
        schema_version: 1,
        zenith_version: '0.0.0-test',
        target: 'cloudflare',
        base_path: '',
        content_hash: 'test',
        routes: [],
        assets: {
            js: [],
            css: [],
            vendor: null
        }
    };
    const routeManifest = [
        {
            path: '/posts/:slug',
            file: 'src/pages/posts/[slug].zen',
            path_kind: 'dynamic',
            render_mode: 'server',
            params: ['slug'],
            route_kind: 'page',
            has_load: true
        }
    ];
    const serverManifest = {
        routes: [
            {
                path: '/posts/:slug',
                file: 'src/pages/posts/[slug].zen',
                path_kind: 'dynamic',
                render_mode: 'server',
                params: ['slug'],
                route_kind: 'page',
                name: 'posts_slug',
                page_asset_file: 'pages/posts_slug.js',
                image_manifest_file: 'images/posts_slug.json',
                has_scoped_server_data: true,
                scoped_server_data: [
                    {
                        owner_key: 'src/components/Card.zen',
                        runtime_key: 'component:src/components/Card.zen'
                    }
                ]
            },
            {
                path: '/feed.xml',
                file: 'src/pages/feed.xml.resource.ts',
                path_kind: 'static',
                render_mode: 'server',
                params: [],
                route_kind: 'resource',
                name: 'feed_xml',
                page_asset_file: null,
                image_manifest_file: null
            }
        ],
        global_middleware: {
            source_file: 'src/middleware.ts'
        }
    };

    return { buildManifest, routeManifest, serverManifest };
}

describe('hosted adapter context', () => {
    test('classifies only built-in hosted targets', () => {
        expect(classifyHostedBuiltInTarget('vercel')).toBe('vercel');
        expect(classifyHostedBuiltInTarget('netlify')).toBe('netlify');
        expect(classifyHostedBuiltInTarget('cloudflare')).toBeUndefined();
        expect(classifyHostedBuiltInTarget('vercel-static')).toBeUndefined();
        expect(classifyHostedBuiltInTarget('netlify-static')).toBeUndefined();
    });

    test('preserves raw adapter identity separately from hosted classification', () => {
        const { buildManifest, routeManifest, serverManifest } = createManifestFixtures();
        const rawContext = createHostedAdapterContext({
            coreOutput: '/tmp/core',
            outDir: '/tmp/out',
            config: { adapter: 'custom' },
            adapterName: 'cloudflare',
            target: 'cloudflare',
            buildManifest,
            routeManifest,
            serverManifest
        });

        expect(rawContext.adapterName).toBe('cloudflare');
        expect(rawContext.target).toBe('cloudflare');
        expect(rawContext.builtInTarget).toBeUndefined();

        const wrappedVercelContext = createHostedAdapterContext({
            coreOutput: '/tmp/core',
            outDir: '/tmp/out',
            config: { adapter: 'wrapped' },
            adapterName: 'raw-vercel-wrapper',
            target: 'vercel',
            buildManifest,
            routeManifest,
            serverManifest
        });

        expect(wrappedVercelContext.adapterName).toBe('raw-vercel-wrapper');
        expect(wrappedVercelContext.target).toBe('vercel');
        expect(wrappedVercelContext.builtInTarget).toBe('vercel');
    });

    test('carries manifests by reference without mutation or narrowing', () => {
        const { buildManifest, routeManifest, serverManifest } = createManifestFixtures();
        const context = createHostedAdapterContext({
            coreOutput: '/tmp/core',
            outDir: '/tmp/out',
            config: {},
            adapterName: 'netlify',
            target: 'netlify',
            buildManifest,
            routeManifest,
            serverManifest
        });

        expect(context.buildManifest).toBe(buildManifest);
        expect(context.routeManifest).toBe(routeManifest);
        expect(context.serverManifest).toBe(serverManifest);
        expect(context.builtInTarget).toBe('netlify');
        expect(context.serverManifest.routes[0].name).toBe('posts_slug');
        expect(context.serverManifest.routes[0].image_manifest_file).toBe('images/posts_slug.json');
        expect(context.serverManifest.routes[0].scoped_server_data[0].runtime_key)
            .toBe('component:src/components/Card.zen');
        expect(context.serverManifest.routes[1].page_asset_file).toBeNull();
        expect(context.serverManifest.routes[1].image_manifest_file).toBeNull();
    });

    test('keeps hosted capabilities as explicit internal metadata', () => {
        const { buildManifest, routeManifest, serverManifest } = createManifestFixtures();
        const context = createHostedAdapterContext({
            coreOutput: '/tmp/core',
            outDir: '/tmp/out',
            config: {},
            adapterName: 'vercel',
            target: 'vercel',
            buildManifest,
            routeManifest,
            serverManifest
        });

        expect(context.capabilities).toEqual({
            serverRendering: true,
            hostedFunctions: true,
            imageEndpoint: true,
            globalMiddleware: true,
            scopedServerData: true,
            resourceRoutes: true
        });

        const customCapabilities = {
            serverRendering: true,
            hostedFunctions: true,
            imageEndpoint: false,
            globalMiddleware: false,
            scopedServerData: true,
            resourceRoutes: true
        };
        const customContext = createHostedAdapterContext({
            coreOutput: '/tmp/core',
            outDir: '/tmp/out',
            config: {},
            adapterName: 'custom-hosted',
            target: 'custom-hosted',
            buildManifest,
            routeManifest,
            serverManifest,
            capabilities: customCapabilities
        });

        expect(customContext.capabilities).toBe(customCapabilities);
    });
});
