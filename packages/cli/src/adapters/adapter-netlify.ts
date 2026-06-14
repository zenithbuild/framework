import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { prependBasePath } from '../base-path.js';
import { compareRouteSpecificity } from '../server/resolve-request-route.js';
import { copyHostedGlobalMiddlewareRuntime, copyHostedPageRuntime } from './copy-hosted-page-runtime.js';
import { createHostedAdapterContext } from './hosted-adapter-context.js';
import { createNetlifyBasePathAssetRules, createNetlifyImageEndpointRule, createNetlifyRewriteRules } from './route-rules.js';
import { validateHostedResourceRoutes } from './validate-hosted-resource-routes.js';
import type { AdapterDriver, BuildManifest } from './adapter-types.js';
import type { HostedServerManifest, HostedServerManifestRoute } from './hosted-adapter-context.js';

interface AdapterConfig {
    images?: unknown;
}

function buildNetlifyServerRules(route: HostedServerManifestRoute, basePath = '/') {
    const destination = `/.netlify/functions/__zenith_${route.name}`;
    if (!Array.isArray(route.params) || route.params.length === 0) {
        return [`${prependBasePath(basePath, route.path === '/' ? '/' : route.path)} ${destination} 200!`];
    }

    const segments = route.path.split('/').filter(Boolean);
    const terminal = segments[segments.length - 1];
    const prefix = segments.slice(0, -1).join('/');
    const prefixPath = prefix ? `/${prefix}` : '';

    if (terminal.startsWith('*') && terminal.endsWith('?')) {
        const key = terminal.slice(1, -1);
        const exactPath = prefixPath || '/';
        const splatPath = prefixPath ? `${prefixPath}/*` : '/*';
        return [
            `${prependBasePath(basePath, exactPath)} ${destination}?__zenith_param_${key}= 200!`,
            `${prependBasePath(basePath, splatPath)} ${destination}?__zenith_param_${key}=:splat 200!`
        ];
    }

    if (terminal.startsWith('*')) {
        const key = terminal.slice(1);
        const splatPath = prefixPath ? `${prefixPath}/*` : '/*';
        return [`${prependBasePath(basePath, splatPath)} ${destination}?__zenith_param_${key}=:splat 200!`];
    }

    const sourcePath = `/${segments.map((segment) => segment.startsWith(':') ? segment : segment).join('/')}`;
    const query = route.params.map((param) => `__zenith_param_${param}=:${param}`).join('&');
    return [`${prependBasePath(basePath, sourcePath)} ${destination}?${query} 200!`];
}

function createFunctionSource(route: HostedServerManifestRoute, globalMiddlewareModulePath: string | null) {
    const globalMiddlewarePathExpression = globalMiddlewareModulePath
        ? "join(__dirname, '_zenith', 'global-middleware', 'entry.js')"
        : 'null';
    return [
        "import { fileURLToPath } from 'node:url';",
        "import { dirname, join } from 'node:path';",
        "import { renderResourceRouteRequest, renderRouteRequest, extractInternalParams } from './_zenith/runtime/route-render.js';",
        '',
        'const __dirname = dirname(fileURLToPath(import.meta.url));',
        `const globalMiddlewareModulePath = ${globalMiddlewarePathExpression};`,
        `const route = ${JSON.stringify(route, null, 2)};`,
        '',
        'function createHostedUnsupportedResponse(message) {',
        "  return new Response(message, { status: 501, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });",
        '}',
        '',
        'export default async function(request) {',
        '  const params = extractInternalParams(request.url, route);',
        "  if (route.route_kind === 'resource') {",
        '    const response = await renderResourceRouteRequest({',
        '      request,',
        '      route,',
        '      params,',
        `      routeModulePath: join(__dirname, '_zenith', 'routes', ${JSON.stringify(route.name)}, 'route', 'entry.js'),`,
        '      globalMiddlewareModulePath',
        '    });',
        "    if (response.headers.has('content-disposition')) {",
        "      return createHostedUnsupportedResponse('Hosted resource downloads are unsupported in this milestone');",
        '    }',
        '    return response;',
        '  }',
        '  return renderRouteRequest({',
        '    request,',
        '    route,',
        '    params,',
        `    routeModulePath: join(__dirname, '_zenith', 'routes', ${JSON.stringify(route.name)}, 'route', 'entry.js'),`,
        '    globalMiddlewareModulePath,',
        `    shellHtmlPath: join(__dirname, '_zenith', 'routes', ${JSON.stringify(route.name)}, 'route', 'page.html'),`,
        `    pageAssetPath: ${route.page_asset_file ? "join(__dirname, '_zenith', 'routes', " + JSON.stringify(route.name) + ", 'route', " + JSON.stringify(route.page_asset_file) + ')' : 'null'},`,
        `    imageManifestPath: ${route.image_manifest_file ? "join(__dirname, '_zenith', 'routes', " + JSON.stringify(route.name) + ", 'route', " + JSON.stringify(route.image_manifest_file) + ')' : 'null'},`,
        `    imageConfig: ${JSON.stringify(route.image_config || {}, null, 2)}`,
        '  });',
        '}',
        ''
    ].join('\n');
}

function createImageFunctionSource(imagesConfig: unknown) {
    return [
        "import { fileURLToPath } from 'node:url';",
        "import { dirname } from 'node:path';",
        "import { handleImageFetchRequest } from './_zenith/images/service.js';",
        '',
        'const __dirname = dirname(fileURLToPath(import.meta.url));',
        `const imageConfig = ${JSON.stringify(imagesConfig || {}, null, 2)};`,
        '',
        'export default async function(request) {',
        '  return handleImageFetchRequest(request, {',
        '    projectRoot: __dirname,',
        '    config: imageConfig',
        '  });',
        '}',
        ''
    ].join('\n');
}

function hasHostedScopedServerData(route: HostedServerManifestRoute) {
    return route.route_kind !== 'resource' &&
        route.has_scoped_server_data === true &&
        Array.isArray(route.scoped_server_data) &&
        route.scoped_server_data.length > 0;
}

async function loadServerManifest(coreOutput: string): Promise<HostedServerManifest | null> {
    try {
        const parsed = JSON.parse(await readFile(join(coreOutput, 'server', 'manifest.json'), 'utf8'));
        if (!parsed || typeof parsed !== 'object') {
            return { routes: [] };
        }
        return {
            ...parsed,
            routes: Array.isArray(parsed.routes) ? parsed.routes : []
        };
    } catch {
        return null;
    }
}

function buildRedirectsFile(buildManifest: BuildManifest, serverRoutes: HostedServerManifestRoute[]) {
    const lines = [
        '# Generated by Zenith netlify adapter',
        ...createNetlifyBasePathAssetRules(buildManifest.base_path),
        createNetlifyImageEndpointRule(buildManifest.base_path)
    ];
    const seen = new Set<string>();

    for (const route of [...serverRoutes].sort((left, right) => compareRouteSpecificity(left.path, right.path))) {
        for (const line of buildNetlifyServerRules(route, buildManifest.base_path)) {
            if (seen.has(line)) {
                continue;
            }
            seen.add(line);
            lines.push(line);
        }
    }

    for (const route of buildManifest.routes.filter((entry) => entry.render_mode === 'prerender' && entry.path_kind === 'dynamic')) {
        for (const line of createNetlifyRewriteRules(route, buildManifest.base_path)) {
            if (seen.has(line)) {
                continue;
            }
            seen.add(line);
            lines.push(line);
        }
    }

    return `${lines.join('\n')}\n`;
}

export const netlifyAdapter: AdapterDriver = {
    name: 'netlify',
    validateRoutes(manifest) {
        validateHostedResourceRoutes(manifest, 'netlify');
    },
    async adapt(options) {
        // Route meaning is fixed upstream in the manifest/server package.
        // The adapter only maps already-classified output into Netlify's layout.
        const serverManifest = await loadServerManifest(options.coreOutput);
        const hostedContext = createHostedAdapterContext({
            adapterName: 'netlify',
            target: options.manifest.target,
            buildManifest: options.manifest,
            routeManifest: serverManifest?.routes ?? [],
            serverManifest,
            coreOutput: options.coreOutput,
            outDir: options.outDir,
            config: options.config
        });
        const serverRoutes = (hostedContext.serverManifest?.routes ?? hostedContext.routeManifest) as HostedServerManifestRoute[];
        const publishDir = join(hostedContext.outDir, 'publish');
        const functionsDir = join(hostedContext.outDir, 'functions');
        const staticDir = join(hostedContext.coreOutput, 'static');

        await rm(hostedContext.outDir, { recursive: true, force: true });
        await mkdir(publishDir, { recursive: true });
        await mkdir(functionsDir, { recursive: true });
        await cp(staticDir, publishDir, { recursive: true, force: true });
        await writeFile(join(functionsDir, 'package.json'), '{\n  "type": "module"\n}\n', 'utf8');

        await copyHostedPageRuntime(hostedContext.coreOutput, join(functionsDir, '_zenith'), {
            includeScopedServerData: serverRoutes.some(hasHostedScopedServerData)
        });
        const globalMiddlewareModulePath = serverRoutes.length > 0
            ? await copyHostedGlobalMiddlewareRuntime(hostedContext.coreOutput, join(functionsDir, '_zenith'))
            : null;
        await writeFile(
            join(functionsDir, '__zenith_image.mjs'),
            createImageFunctionSource((hostedContext.config as AdapterConfig | null | undefined)?.images || {}),
            'utf8'
        );
        for (const route of serverRoutes) {
            await cp(
                join(hostedContext.coreOutput, 'server', 'routes', route.name),
                join(functionsDir, '_zenith', 'routes', route.name),
                { recursive: true, force: true }
            );
            await writeFile(
                join(functionsDir, `__zenith_${route.name}.mjs`),
                createFunctionSource(route, globalMiddlewareModulePath),
                'utf8'
            );
        }

        await writeFile(join(publishDir, '_redirects'), buildRedirectsFile(hostedContext.buildManifest, serverRoutes), 'utf8');
        await writeFile(
            join(hostedContext.outDir, 'netlify.toml'),
            [
                '[build]',
                'publish = "publish"',
                '',
                '[functions]',
                'directory = "functions"',
                'node_bundler = "esbuild"',
                ''
            ].join('\n'),
            'utf8'
        );
    }
};
