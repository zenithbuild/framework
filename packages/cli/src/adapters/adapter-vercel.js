import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { compareRouteSpecificity } from '../server/resolve-request-route.js';
import { createVercelBasePathAssetRoutes, createVercelRouteSource } from './route-rules.js';

function buildVercelServerDest(route) {
    const base = `/__zenith/${route.name}`;
    if (!Array.isArray(route.params) || route.params.length === 0) {
        return base;
    }
    const query = route.params.map((param, index) => `__zenith_param_${param}=$${index + 1}`).join('&');
    return `${base}?${query}`;
}

function buildVercelConfig(buildManifest, serverRoutes) {
    const routes = [...createVercelBasePathAssetRoutes(buildManifest.base_path)];
    for (const route of [...serverRoutes].sort((left, right) => compareRouteSpecificity(left.path, right.path))) {
        routes.push({
            src: createVercelRouteSource(route.path, buildManifest.base_path),
            dest: buildVercelServerDest(route)
        });
    }
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

function createFunctionSource(route) {
    return [
        "import { fileURLToPath } from 'node:url';",
        "import { dirname, join } from 'node:path';",
        "import { renderRouteRequest, extractInternalParams } from './runtime/route-render.js';",
        '',
        'const __dirname = dirname(fileURLToPath(import.meta.url));',
        `const route = ${JSON.stringify(route, null, 2)};`,
        '',
        'export default {',
        '  async fetch(request) {',
        '    const params = extractInternalParams(request.url, route);',
        '    return renderRouteRequest({',
        '      request,',
        '      route,',
        '      params,',
        "      routeModulePath: join(__dirname, 'route', 'entry.js'),",
        "      shellHtmlPath: join(__dirname, 'route', 'page.html'),",
        `      pageAssetPath: ${route.page_asset_file ? "join(__dirname, 'route', " + JSON.stringify(route.page_asset_file) + ')' : 'null'},`,
        `      imageManifestPath: ${route.image_manifest_file ? "join(__dirname, 'route', " + JSON.stringify(route.image_manifest_file) + ')' : 'null'},`,
        `      imageConfig: ${JSON.stringify(route.image_config || {}, null, 2)}`,
        '    });',
        '  }',
        '};',
        ''
    ].join('\n');
}

async function loadServerManifest(coreOutput) {
    try {
        const parsed = JSON.parse(await readFile(join(coreOutput, 'server', 'manifest.json'), 'utf8'));
        return Array.isArray(parsed.routes) ? parsed.routes : [];
    } catch {
        return [];
    }
}

export const vercelAdapter = {
    name: 'vercel',
    validateRoutes() {},
    async adapt(options) {
        const staticDir = join(options.coreOutput, 'static');
        // Route meaning is fixed upstream in the manifest/server package.
        // The adapter only maps already-classified output into Vercel's layout.
        const serverRoutes = await loadServerManifest(options.coreOutput);
        await rm(options.outDir, { recursive: true, force: true });
        await mkdir(join(options.outDir, 'static'), { recursive: true });
        await cp(staticDir, join(options.outDir, 'static'), { recursive: true, force: true });

        for (const route of serverRoutes) {
            const functionDir = join(options.outDir, 'functions', '__zenith', `${route.name}.func`);
            await mkdir(functionDir, { recursive: true });
            await cp(join(options.coreOutput, 'server', 'runtime'), join(functionDir, 'runtime'), { recursive: true, force: true });
            await cp(join(options.coreOutput, 'server', 'images'), join(functionDir, 'images'), { recursive: true, force: true });
            await cp(join(options.coreOutput, 'server', 'base-path.js'), join(functionDir, 'base-path.js'), { force: true });
            await cp(join(options.coreOutput, 'server', 'server-contract.js'), join(functionDir, 'server-contract.js'), { force: true });
            await cp(join(options.coreOutput, 'server', 'server-error.js'), join(functionDir, 'server-error.js'), { force: true });
            await cp(join(options.coreOutput, 'server', 'routes', route.name), functionDir, { recursive: true, force: true });
            await writeFile(join(functionDir, 'package.json'), '{\n  "type": "module"\n}\n', 'utf8');
            await writeFile(join(functionDir, 'index.js'), createFunctionSource(route), 'utf8');
            await writeFile(
                join(functionDir, '.vc-config.json'),
                `${JSON.stringify({
                    runtime: 'nodejs22.x',
                    handler: 'index.js',
                    launcherType: 'Nodejs',
                    shouldAddHelpers: true
                }, null, 2)}\n`,
                'utf8'
            );
        }

        await writeFile(
            join(options.outDir, 'config.json'),
            `${JSON.stringify(buildVercelConfig(options.manifest, serverRoutes), null, 2)}\n`,
            'utf8'
        );
    }
};
