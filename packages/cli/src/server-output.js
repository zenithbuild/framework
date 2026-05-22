import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadResourceRouteManifest } from './resource-manifest.js';
import { assignServerRouteNames } from './server-route-names.js';
import { normalizeGlobalMiddlewareMetadata } from './global-middleware.js';

const PACKAGE_REQUIRE = createRequire(import.meta.url);
const RELATIVE_SPECIFIER_RE = /((?:import|export)\s+(?:[^'"]*?\s+from\s+)?|import\s*\()\s*(['"])([^'"]+)\2/g;
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
const SPECIAL_SERVER_SPECIFIERS = new Map([
    ['zenith:server-contract', 'server-contract.js'],
    ['zenith:route-auth', 'auth/route-auth.js']
]);

function resolveTypeScriptApi(projectRoot) {
    try {
        const projectRequire = createRequire(join(projectRoot, '__zenith_server_output_loader__.js'));
        return projectRequire('typescript');
    } catch {
        try {
            return PACKAGE_REQUIRE('typescript');
        } catch {
            throw new Error(
                '[Zenith:Build] Server-capable targets require the `typescript` package to transpile route modules.'
            );
        }
    }
}

function withJsExtension(specifier) {
    if (specifier.endsWith('.json')) {
        return specifier;
    }
    return specifier.replace(/\.(tsx|ts|mts|cts|jsx|js|mjs|cjs)$/i, '.js');
}

function replaceSpecifier(source, original, nextValue) {
    return source.replace(
        new RegExp(`(['"])${escapeRegex(original)}\\1`, 'g'),
        (_, quote) => `${quote}${nextValue}${quote}`
    );
}

function escapeRegex(value) {
    return String(value).replace(/[|\\{}()[\]^$+*?.-]/g, '\\$&');
}

function isRelativeSpecifier(specifier) {
    return (
        specifier.startsWith('./') ||
        specifier.startsWith('../') ||
        specifier.startsWith('/') ||
        specifier.startsWith('file:')
    );
}

function resolveModuleCandidates(basePath) {
    if (extname(basePath)) {
        return [basePath];
    }
    return [
        basePath,
        `${basePath}.ts`,
        `${basePath}.tsx`,
        `${basePath}.mts`,
        `${basePath}.cts`,
        `${basePath}.js`,
        `${basePath}.mjs`,
        `${basePath}.cjs`,
        `${basePath}.json`,
        join(basePath, 'index.ts'),
        join(basePath, 'index.tsx'),
        join(basePath, 'index.mts'),
        join(basePath, 'index.cts'),
        join(basePath, 'index.js'),
        join(basePath, 'index.mjs'),
        join(basePath, 'index.cjs'),
        join(basePath, 'index.json')
    ];
}

function resolveImportedModule(specifier, sourceFile) {
    if (!isRelativeSpecifier(specifier)) {
        return null;
    }
    const baseDir = dirname(sourceFile);
    const basePath = specifier.startsWith('file:')
        ? new URL(specifier)
        : resolve(baseDir, specifier);
    const filePath = basePath instanceof URL ? fileURLToPath(basePath) : basePath;
    const candidates = resolveModuleCandidates(filePath);
    const found = candidates.find((candidate) => existsSync(candidate));
    if (!found) {
        throw new Error(`[Zenith:Build] Cannot resolve server import "${specifier}" from "${sourceFile}"`);
    }
    return found;
}

function gatherSpecifiers(source) {
    const results = [];
    for (const match of source.matchAll(RELATIVE_SPECIFIER_RE)) {
        const specifier = String(match[3] || '');
        results.push(specifier);
    }
    return results;
}

function transpileSource(ts, source, filePath) {
    return ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
            moduleResolution: ts.ModuleResolutionKind.NodeNext,
            esModuleInterop: true,
            allowSyntheticDefaultImports: true
        },
        fileName: filePath
    }).outputText;
}

function outputPathForSource(projectRoot, modulesRoot, sourcePath) {
    const relativePath = relative(projectRoot, sourcePath).replaceAll('\\', '/');
    const nextRelative = extname(relativePath) === '.json'
        ? relativePath
        : relativePath.replace(/\.(tsx|ts|mts|cts|jsx|js|mjs|cjs)$/i, '.js');
    return join(modulesRoot, nextRelative);
}

async function compileImportedModule({
    projectRoot,
    modulesRoot,
    serverDir,
    sourcePath,
    ts,
    seen
}) {
    if (seen.has(sourcePath)) {
        return outputPathForSource(projectRoot, modulesRoot, sourcePath);
    }
    seen.add(sourcePath);

    const outPath = outputPathForSource(projectRoot, modulesRoot, sourcePath);
    await mkdir(dirname(outPath), { recursive: true });

    if (extname(sourcePath) === '.json') {
        await cp(sourcePath, outPath, { force: true });
        return outPath;
    }

    const source = await readFile(sourcePath, 'utf8');
    let output = transpileSource(ts, source, sourcePath);
    for (const specifier of gatherSpecifiers(output)) {
        const specialSpecifierPath = SPECIAL_SERVER_SPECIFIERS.get(specifier);
        if (specialSpecifierPath) {
            const nextSpecifier = relative(dirname(outPath), join(serverDir, specialSpecifierPath)).replaceAll('\\', '/');
            output = replaceSpecifier(
                output,
                specifier,
                nextSpecifier.startsWith('.') ? nextSpecifier : `./${nextSpecifier}`
            );
            continue;
        }
        if (!isRelativeSpecifier(specifier)) {
            continue;
        }
        const resolvedPath = resolveImportedModule(specifier, sourcePath);
        if (!resolvedPath) {
            continue;
        }
        const compiledDependencyPath = await compileImportedModule({
            projectRoot,
            modulesRoot,
            serverDir,
            sourcePath: resolvedPath,
            ts,
            seen
        });
        const nextSpecifier = relative(dirname(outPath), compiledDependencyPath).replaceAll('\\', '/');
        output = replaceSpecifier(
            output,
            specifier,
            nextSpecifier.startsWith('.') ? nextSpecifier : `./${nextSpecifier}`
        );
    }

    await writeFile(outPath, output, 'utf8');
    return outPath;
}

async function writeRouteModulePackage({
    projectRoot,
    serverDir,
    routeDir,
    route
}) {
    const ts = resolveTypeScriptApi(projectRoot);
    const modulesRoot = join(routeDir, 'modules');
    const seen = new Set();
    let entryOutput = transpileSource(ts, route.server_script || '', route.server_script_path || 'route-entry.ts');

    for (const specifier of gatherSpecifiers(entryOutput)) {
        const specialSpecifierPath = SPECIAL_SERVER_SPECIFIERS.get(specifier);
        if (specialSpecifierPath) {
            const nextSpecifier = relative(join(routeDir, 'route'), join(serverDir, specialSpecifierPath)).replaceAll('\\', '/');
            entryOutput = replaceSpecifier(
                entryOutput,
                specifier,
                nextSpecifier.startsWith('.') ? nextSpecifier : `./${nextSpecifier}`
            );
            continue;
        }
        if (!isRelativeSpecifier(specifier)) {
            continue;
        }
        const resolvedPath = resolveImportedModule(specifier, route.server_script_path || projectRoot);
        if (!resolvedPath) {
            continue;
        }
        const compiledDependencyPath = await compileImportedModule({
            projectRoot,
            modulesRoot,
            serverDir,
            sourcePath: resolvedPath,
            ts,
            seen
        });
        const nextSpecifier = relative(join(routeDir, 'route'), compiledDependencyPath).replaceAll('\\', '/');
        entryOutput = replaceSpecifier(
            entryOutput,
            specifier,
            nextSpecifier.startsWith('.') ? nextSpecifier : `./${nextSpecifier}`
        );
    }

    const routeModulePath = join(routeDir, 'route', 'entry.js');
    await mkdir(dirname(routeModulePath), { recursive: true });
    await writeFile(routeModulePath, entryOutput, 'utf8');
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

export async function writeServerOutput({
    coreOutputDir,
    staticDir,
    projectRoot,
    config,
    basePath = '/',
    globalMiddleware = null
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

    const pageRoutes = Array.isArray(routerManifest.routes) ? routerManifest.routes : [];
    const serverRoutes = pageRoutes
        .filter((route) => route.server_script && route.prerender !== true)
        .map((route) => ({ ...route, route_kind: 'page' }))
        .concat(
            (Array.isArray(resourceManifest.routes) ? resourceManifest.routes : []).map((route) => ({
                ...route,
                route_kind: 'resource'
            }))
        );

    await mkdir(serverDir, { recursive: true });
    await copyRuntimeFiles(serverDir);

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
        if (route.route_kind !== 'resource' && Array.isArray(route.image_materialization) && route.image_materialization.length > 0) {
            meta.image_materialization = route.image_materialization;
        }
        await writeFile(join(routeDir, 'route.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
        emittedRoutes.push(meta);
    }

    const globalMiddlewareMetadata = normalizeGlobalMiddlewareMetadata(globalMiddleware);
    const serverManifest = {
        base_path: basePath,
        ...(globalMiddlewareMetadata ? { global_middleware: globalMiddlewareMetadata } : {}),
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
