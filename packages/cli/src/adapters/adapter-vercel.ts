import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { compareRouteSpecificity } from '../server/resolve-request-route.js';
import { copyHostedGlobalMiddlewareRuntime, copyHostedPageRuntime } from './copy-hosted-page-runtime.js';
import { createHostedAdapterContext } from './hosted-adapter-context.js';
import { createVercelBasePathAssetRoutes, createVercelImageEndpointRoute, createVercelRouteSource } from './route-rules.js';
import { validateHostedResourceRoutes } from './validate-hosted-resource-routes.js';
import type { AdapterDriver, BuildManifest } from './adapter-types.js';
import type { HostedServerManifest, HostedServerManifestRoute } from './hosted-adapter-context.js';

interface AdapterConfig {
    images?: unknown;
}

interface VercelConfigRoute {
    src?: string;
    dest?: string;
    handle?: 'filesystem';
}

function buildVercelServerDest(route: HostedServerManifestRoute) {
    const base = `/__zenith/${route.name}`;
    if (!Array.isArray(route.params) || route.params.length === 0) {
        return base;
    }
    const query = route.params.map((param, index) => `__zenith_param_${param}=$${index + 1}`).join('&');
    return `${base}?${query}`;
}

function buildVercelConfig(buildManifest: BuildManifest, serverRoutes: HostedServerManifestRoute[]) {
    const routes: VercelConfigRoute[] = [...createVercelBasePathAssetRoutes(buildManifest.base_path)];
    for (const route of [...serverRoutes].sort((left, right) => compareRouteSpecificity(left.path, right.path))) {
        routes.push({
            src: createVercelRouteSource(route.path, buildManifest.base_path),
            dest: buildVercelServerDest(route)
        });
    }
    routes.push(createVercelImageEndpointRoute(buildManifest.base_path));
    routes.push({ handle: 'filesystem' });
    for (const route of buildManifest.routes.filter((entry) => entry.render_mode === 'prerender' && entry.path_kind === 'dynamic')) {
        routes.push({
            src: createVercelRouteSource(route.path, buildManifest.base_path),
            dest: route.html
        });
    }
    return {
        version: 3,
        routes
    };
}

function createImageFunctionSource(imagesConfig: unknown) {
    return [
        "import { fileURLToPath } from 'node:url';",
        "import { dirname } from 'node:path';",
        "import { handleImageFetchRequest } from './images/service.js';",
        '',
        'const __dirname = dirname(fileURLToPath(import.meta.url));',
        `const imageConfig = ${JSON.stringify(imagesConfig || {}, null, 2)};`,
        '',
        'export default {',
        '  async fetch(request) {',
        '    return handleImageFetchRequest(request, {',
        '      projectRoot: __dirname,',
        '      config: imageConfig',
        '    });',
        '  }',
        '};',
        ''
    ].join('\n');
}

function createFunctionSource(route: HostedServerManifestRoute, globalMiddlewareModulePath: string | null) {
    const globalMiddlewarePathExpression = globalMiddlewareModulePath
        ? "join(__dirname, 'global-middleware', 'entry.js')"
        : 'null';
    return [
        "import { fileURLToPath } from 'node:url';",
        "import { dirname, join } from 'node:path';",
        "import { renderResourceRouteRequest, renderRouteRequest, extractInternalParams } from './runtime/route-render.js';",
        '',
        'const __dirname = dirname(fileURLToPath(import.meta.url));',
        `const globalMiddlewareModulePath = ${globalMiddlewarePathExpression};`,
        `const route = ${JSON.stringify(route, null, 2)};`,
        '',
        'function createHostedUnsupportedResponse(message) {',
        "  return new Response(message, { status: 501, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });",
        '}',
        '',
        'export default {',
        '  async fetch(request) {',
        '    const params = extractInternalParams(request.url, route);',
        "    if (route.route_kind === 'resource') {",
        '      const response = await renderResourceRouteRequest({',
        '        request,',
        '        route,',
        '        params,',
        `        routeModulePath: join(__dirname, 'routes', ${JSON.stringify(route.name)}, 'route', 'entry.js'),`,
        '        globalMiddlewareModulePath',
        '      });',
        "      if (response.headers.has('content-disposition')) {",
        "        return createHostedUnsupportedResponse('Hosted resource downloads are unsupported in this milestone');",
        '      }',
        '      return response;',
        '    }',
        '    return renderRouteRequest({',
        '      request,',
        '      route,',
        '      params,',
        `      routeModulePath: join(__dirname, 'routes', ${JSON.stringify(route.name)}, 'route', 'entry.js'),`,
        '      globalMiddlewareModulePath,',
        `      shellHtmlPath: join(__dirname, 'routes', ${JSON.stringify(route.name)}, 'route', 'page.html'),`,
        `      pageAssetPath: ${route.page_asset_file ? "join(__dirname, 'routes', " + JSON.stringify(route.name) + ", 'route', " + JSON.stringify(route.page_asset_file) + ')' : 'null'},`,
        `      imageManifestPath: ${route.image_manifest_file ? "join(__dirname, 'routes', " + JSON.stringify(route.name) + ", 'route', " + JSON.stringify(route.image_manifest_file) + ')' : 'null'},`,
        `      imageConfig: ${JSON.stringify(route.image_config || {}, null, 2)}`,
        '    });',
        '  }',
        '};',
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

function vercelFunctionConfig() {
    return `${JSON.stringify({
        runtime: 'nodejs22.x',
        handler: 'index.js',
        launcherType: 'Nodejs',
        shouldAddHelpers: true
    }, null, 2)}\n`;
}

async function writeHostedFunctionBundle(functionDir: string, coreOutput: string, source: string) {
    await mkdir(functionDir, { recursive: true });
    await copyHostedPageRuntime(coreOutput, functionDir);
    await writeFile(join(functionDir, 'package.json'), '{\n  "type": "module"\n}\n', 'utf8');
    await writeFile(join(functionDir, 'index.js'), source, 'utf8');
    await writeFile(join(functionDir, '.vc-config.json'), vercelFunctionConfig(), 'utf8');
}

export const vercelAdapter: AdapterDriver = {
    name: 'vercel',
    validateRoutes(manifest) {
        validateHostedResourceRoutes(manifest, 'vercel');
    },
    async adapt(options) {
        // Route meaning is fixed upstream in the manifest/server package.
        // The adapter only maps already-classified output into Vercel's layout.
        const serverManifest = await loadServerManifest(options.coreOutput);
        const hostedContext = createHostedAdapterContext({
            adapterName: 'vercel',
            target: options.manifest.target,
            buildManifest: options.manifest,
            routeManifest: serverManifest?.routes ?? [],
            serverManifest,
            coreOutput: options.coreOutput,
            outDir: options.outDir,
            config: options.config
        });
        const serverRoutes = (hostedContext.serverManifest?.routes ?? hostedContext.routeManifest) as HostedServerManifestRoute[];
        const staticDir = join(hostedContext.coreOutput, 'static');
        await rm(hostedContext.outDir, { recursive: true, force: true });
        await mkdir(join(hostedContext.outDir, 'static'), { recursive: true });
        await cp(staticDir, join(hostedContext.outDir, 'static'), { recursive: true, force: true });

        await writeHostedFunctionBundle(
            join(hostedContext.outDir, 'functions', '__zenith', 'image.func'),
            hostedContext.coreOutput,
            createImageFunctionSource((hostedContext.config as AdapterConfig | null | undefined)?.images || {})
        );

        for (const route of serverRoutes) {
            const functionDir = join(hostedContext.outDir, 'functions', '__zenith', `${route.name}.func`);
            await mkdir(functionDir, { recursive: true });
            await copyHostedPageRuntime(hostedContext.coreOutput, functionDir, {
                includeScopedServerData: hasHostedScopedServerData(route)
            });
            const globalMiddlewareModulePath = await copyHostedGlobalMiddlewareRuntime(hostedContext.coreOutput, functionDir);
            await cp(
                join(hostedContext.coreOutput, 'server', 'routes', route.name),
                join(functionDir, 'routes', route.name),
                { recursive: true, force: true }
            );
            await writeFile(join(functionDir, 'package.json'), '{\n  "type": "module"\n}\n', 'utf8');
            await writeFile(join(functionDir, 'index.js'), createFunctionSource(route, globalMiddlewareModulePath), 'utf8');
            await writeFile(join(functionDir, '.vc-config.json'), vercelFunctionConfig(), 'utf8');
        }

        await writeFile(
            join(hostedContext.outDir, 'config.json'),
            `${JSON.stringify(buildVercelConfig(hostedContext.buildManifest, serverRoutes), null, 2)}\n`,
            'utf8'
        );
    }
};
