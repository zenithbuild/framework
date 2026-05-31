import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadResourceRouteManifest } from './resource-manifest.js';
import { assignServerRouteNames } from './server-route-names.js';
import { normalizeGlobalMiddlewareMetadata } from './global-middleware.js';
import { writeServerModulePackage } from './server-module-output.js';

const GLOBAL_MIDDLEWARE_MODULE = 'global-middleware/entry.js';
const SCOPED_SERVER_DATA_LOWERING_HELPER_UNAVAILABLE =
    '[Zenith:ScopedServerData] Server-output lowering helper is unavailable. Run the CLI build step before packaging scoped server data modules.';
const SERVER_RUNTIME_FILES = [
    {
        from: new URL('./server-runtime/route-render.js', import.meta.url),
        to: 'runtime/route-render.js'
    },
    {
        from: new URL('./server-contract.js', import.meta.url),
        to: 'server-contract.js'
    },
    {
        from: new URL('./server-contract', import.meta.url),
        to: 'server-contract',
        recursive: true
    },
    {
        from: new URL('./scoped-server-data/runtime.js', import.meta.url),
        to: 'scoped-server-data/runtime.js'
    },
    {
        from: new URL('./server-middleware.js', import.meta.url),
        to: 'server-middleware.js'
    },
    {
        from: new URL('./auth/route-auth.js', import.meta.url),
        to: 'auth/route-auth.js'
    },
    {
        from: new URL('./base-path.js', import.meta.url),
        to: 'base-path.js'
    },
    {
        from: new URL('./images/materialize.js', import.meta.url),
        to: 'images/materialize.js'
    },
    {
        from: new URL('./images/payload.js', import.meta.url),
        to: 'images/payload.js'
    },
    {
        from: new URL('./images/shared.js', import.meta.url),
        to: 'images/shared.js'
    },
    {
        from: new URL('./images/remote-fetch.js', import.meta.url),
        to: 'images/remote-fetch.js'
    },
    {
        from: new URL('./images/runtime.js', import.meta.url),
        to: 'images/runtime.js'
    },
    {
        from: new URL('./images/service.js', import.meta.url),
        to: 'images/service.js'
    },
    {
        from: new URL('./server-error.js', import.meta.url),
        to: 'server-error.js'
    },
    {
        from: new URL('./resource-response.js', import.meta.url),
        to: 'resource-response.js'
    },
    {
        from: new URL('./download-result.js', import.meta.url),
        to: 'download-result.js'
    }
];
let scopedServerDataLoweringPromise = null;

function resolveScopedServerDataLoweringPath() {
    const moduleDir = dirname(fileURLToPath(import.meta.url));
    return [
        join(moduleDir, 'scoped-server-data', 'lowering.js'),
        join(moduleDir, '..', 'dist', 'scoped-server-data', 'lowering.js')
    ].find((candidate) => existsSync(candidate)) || null;
}

async function getScopedServerDataLowering() {
    const helperPath = resolveScopedServerDataLoweringPath();
    if (!helperPath) {
        throw new Error(SCOPED_SERVER_DATA_LOWERING_HELPER_UNAVAILABLE);
    }
    if (!scopedServerDataLoweringPromise) {
        scopedServerDataLoweringPromise = import(pathToFileURL(helperPath).href);
    }
    return scopedServerDataLoweringPromise;
}

async function writeRouteModulePackage({
    projectRoot,
    serverDir,
    routeDir,
    route
}) {
    await writeServerModulePackage({
        projectRoot,
        serverDir,
        entrySource: route.server_script || '',
        entrySourcePath: route.server_script_path || 'route-entry.ts',
        entryOutputPath: join(routeDir, 'route', 'entry.js'),
        modulesRoot: join(routeDir, 'modules')
    });
}

async function copyRuntimeFiles(serverDir) {
    for (const file of SERVER_RUNTIME_FILES) {
        const targetPath = join(serverDir, file.to);
        await mkdir(dirname(targetPath), { recursive: true });
        await cp(file.from, targetPath, {
            force: true,
            recursive: file.recursive === true
        });
    }
}

async function copyOptionalFile(sourcePath, targetPath) {
    if (!sourcePath || !existsSync(sourcePath)) {
        return false;
    }
    await mkdir(dirname(targetPath), { recursive: true });
    await cp(sourcePath, targetPath, { force: true });
    return true;
}

async function writeGlobalMiddlewarePackage({ projectRoot, serverDir, globalMiddleware }) {
    const metadata = normalizeGlobalMiddlewareMetadata(globalMiddleware);
    if (!metadata) {
        return null;
    }

    const sourcePath = resolve(projectRoot, metadata.source_file);
    if (!existsSync(sourcePath)) {
        throw new Error(
            `[Zenith:Middleware] Cannot emit global middleware because source file "${metadata.source_file}" was not found.`
        );
    }

    await writeServerModulePackage({
        projectRoot,
        serverDir,
        entrySource: await readFile(sourcePath, 'utf8'),
        entrySourcePath: sourcePath,
        entryOutputPath: join(serverDir, GLOBAL_MIDDLEWARE_MODULE),
        modulesRoot: join(serverDir, 'global-middleware', 'modules'),
        validateMiddlewareImports: true
    });

    return {
        ...metadata,
        module: GLOBAL_MIDDLEWARE_MODULE
    };
}

function mergePageRouteMetadata(route, manifestEntry) {
    if (!manifestEntry) {
        return route;
    }

    return {
        ...route,
        file: manifestEntry.file || route.file || null,
        has_scoped_server_data: manifestEntry.has_scoped_server_data === true || route.has_scoped_server_data === true,
        scoped_server_data: Array.isArray(manifestEntry.scoped_server_data)
            ? manifestEntry.scoped_server_data
            : (Array.isArray(route.scoped_server_data) ? route.scoped_server_data : [])
    };
}

async function writeScopedServerDataModules({
    projectRoot,
    serverDir,
    route,
    pagesDir,
    srcDir,
    registry,
    compilerOpts
}) {
    if (route.route_kind === 'resource' || route.has_scoped_server_data !== true) {
        return [];
    }
    if (!pagesDir || !srcDir || !registry) {
        throw new Error(
            `[Zenith:ScopedServerData] Cannot package scoped server data for route "${route.path}" without build context.`
        );
    }
    if (typeof route.file !== 'string' || route.file.length === 0) {
        throw new Error(
            `[Zenith:ScopedServerData] Cannot package scoped server data for route "${route.path}" without a source file.`
        );
    }

    const pageFile = resolve(pagesDir, route.file);
    const pageSource = await readFile(pageFile, 'utf8');
    const lowering = await getScopedServerDataLowering();
    const lowered = lowering.lowerRouteScopedServerData({
        pageSource,
        pageFile,
        registry,
        srcDir,
        projectRoot,
        compilerOpts,
        scopedServerData: Array.isArray(route.scoped_server_data) ? route.scoped_server_data : []
    });

    if (!Array.isArray(lowered.scopedServerData) || lowered.scopedServerData.length === 0) {
        throw new Error(
            `[Zenith:ScopedServerData] Cannot package scoped server data for route "${route.path}" because no owners were lowered.`
        );
    }

    for (const module of lowered.modules) {
        const entryOutputPath = lowering.resolveScopedServerModuleOutputPath(serverDir, module.module);
        await writeServerModulePackage({
            projectRoot,
            serverDir,
            entrySource: module.source,
            entrySourcePath: module.sourcePath,
            entryOutputPath,
            modulesRoot: join(serverDir, 'scoped', '_modules')
        });
    }

    return lowered.scopedServerData;
}

export async function writeServerOutput({
    coreOutputDir,
    staticDir,
    projectRoot,
    config,
    basePath = '/',
    globalMiddleware = null,
    pageManifest = [],
    pagesDir = null,
    srcDir = null,
    registry = null,
    compilerOpts = {}
}) {
    const serverDir = join(coreOutputDir, 'server');
    await rm(serverDir, { recursive: true, force: true });

    let routerManifest = { routes: [] };
    try {
        routerManifest = JSON.parse(
            await readFile(join(staticDir, 'assets', 'router-manifest.json'), 'utf8')
        );
    } catch {
        routerManifest = { routes: [] };
    }
    const resourceManifest = await loadResourceRouteManifest(staticDir, basePath);

    const pageManifestByPath = new Map(
        (Array.isArray(pageManifest) ? pageManifest : [])
            .filter((entry) => entry?.route_kind !== 'resource')
            .map((entry) => [entry.path, entry])
    );
    const pageRoutes = (Array.isArray(routerManifest.routes) ? routerManifest.routes : [])
        .map((route) => mergePageRouteMetadata(route, pageManifestByPath.get(route.path)));
    const serverRoutes = pageRoutes
        .filter((route) => route.prerender !== true && (route.server_script || route.has_scoped_server_data === true))
        .map((route) => ({ ...route, route_kind: 'page' }))
        .concat(
            (Array.isArray(resourceManifest.routes) ? resourceManifest.routes : []).map((route) => ({
                ...route,
                route_kind: 'resource'
            }))
        );
    if (serverRoutes.some((route) => route.route_kind !== 'resource' && route.has_scoped_server_data === true)) {
        await getScopedServerDataLowering();
    }

    await mkdir(serverDir, { recursive: true });
    await copyRuntimeFiles(serverDir);
    const serverGlobalMiddlewareMetadata = await writeGlobalMiddlewarePackage({
        projectRoot,
        serverDir,
        globalMiddleware
    });

    const imageManifestSource = join(staticDir, '_zenith', 'image', 'manifest.json');
    const emittedRoutes = [];

    for (const { route, name } of assignServerRouteNames(serverRoutes)) {
        const routeDir = join(serverDir, 'routes', name);
        await mkdir(routeDir, { recursive: true });

        if (route.route_kind !== 'resource') {
            const htmlSourcePath = join(staticDir, String(route.output || '').replace(/^\//, ''));
            await copyOptionalFile(htmlSourcePath, join(routeDir, 'route', 'page.html'));
        }

        let pageAssetFile = null;
        if (typeof route.page_asset === 'string' && route.page_asset.length > 0) {
            const assetSourcePath = join(staticDir, route.page_asset.replace(/^\//, ''));
            const assetFileName = basename(assetSourcePath);
            if (await copyOptionalFile(assetSourcePath, join(routeDir, 'route', assetFileName))) {
                pageAssetFile = assetFileName;
            }
        }

        let imageManifestFile = null;
        if (route.route_kind !== 'resource' && await copyOptionalFile(imageManifestSource, join(routeDir, 'route', 'image-manifest.json'))) {
            imageManifestFile = 'image-manifest.json';
        }

        await writeRouteModulePackage({
            projectRoot,
            serverDir,
            routeDir,
            route
        });

        const scopedServerData = await writeScopedServerDataModules({
            projectRoot,
            serverDir,
            route,
            pagesDir,
            srcDir,
            registry,
            compilerOpts
        });

        const meta = {
            name,
            path: route.path,
            route_kind: route.route_kind || 'page',
            output: route.output || null,
            base_path: basePath,
            page_asset: route.page_asset || null,
            page_asset_file: pageAssetFile,
            route_id: route.route_id || null,
            server_script_path: route.server_script_path || null,
            guard_module_ref: route.guard_module_ref || null,
            load_module_ref: route.load_module_ref || null,
            action_module_ref: route.action_module_ref || null,
            has_guard: route.has_guard === true,
            has_load: route.has_load === true,
            has_action: route.has_action === true,
            params: Array.isArray(route.params) && route.params.length > 0
                ? [...route.params]
                : extractRouteParams(route.path),
            image_manifest_file: route.route_kind === 'resource' ? null : imageManifestFile,
            image_config: config?.images || {}
        };
        if (scopedServerData.length > 0) {
            meta.has_scoped_server_data = true;
            meta.scoped_server_data = scopedServerData;
        }
        if (route.route_kind !== 'resource' && Array.isArray(route.image_materialization) && route.image_materialization.length > 0) {
            meta.image_materialization = route.image_materialization;
        }
        await writeFile(join(routeDir, 'route.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
        emittedRoutes.push(meta);
    }

    const serverManifest = {
        base_path: basePath,
        ...(serverGlobalMiddlewareMetadata ? { global_middleware: serverGlobalMiddlewareMetadata } : {}),
        routes: emittedRoutes
    };

    await writeFile(
        join(serverDir, 'manifest.json'),
        `${JSON.stringify(serverManifest, null, 2)}\n`,
        'utf8'
    );
    return {
        serverDir,
        routes: emittedRoutes
    };
}

function extractRouteParams(routePath) {
    return String(routePath || '')
        .split('/')
        .filter(Boolean)
        .filter((segment) => segment.startsWith(':') || segment.startsWith('*'))
        .map((segment) => {
            const raw = segment.slice(1);
            return raw.endsWith('?') ? raw.slice(0, -1) : raw;
        });
}
