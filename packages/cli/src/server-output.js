import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
    }
];

function normalizeRouteName(routePath) {
    if (routePath === '/') {
        return 'index';
    }
    return routePath
        .replace(/^\//, '')
        .replace(/\/+/g, '_')
        .replace(/:/g, 'param_')
        .replace(/\*/g, 'splat_')
        .replace(/\?/g, 'opt')
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
}

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
    routeDir,
    route
}) {
    const ts = resolveTypeScriptApi(projectRoot);
    const modulesRoot = join(routeDir, 'modules');
    const seen = new Set();
    let entryOutput = transpileSource(ts, route.server_script || '', route.server_script_path || 'route-entry.ts');

    for (const specifier of gatherSpecifiers(entryOutput)) {
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
        await cp(file.from, targetPath, { force: true });
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

export async function writeServerOutput({ coreOutputDir, staticDir, projectRoot, config, basePath = '/' }) {
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

    const routes = Array.isArray(routerManifest.routes) ? routerManifest.routes : [];
    const serverRoutes = routes.filter((route) => route.server_script && route.prerender !== true);

    await mkdir(serverDir, { recursive: true });
    await copyRuntimeFiles(serverDir);

    const imageManifestSource = join(staticDir, '_zenith', 'image', 'manifest.json');
    const emittedRoutes = [];

    for (const route of serverRoutes) {
        const name = normalizeRouteName(route.path);
        const routeDir = join(serverDir, 'routes', name);
        await mkdir(routeDir, { recursive: true });

        const htmlSourcePath = join(staticDir, String(route.output || '').replace(/^\//, ''));
        await copyOptionalFile(htmlSourcePath, join(routeDir, 'route', 'page.html'));

        let pageAssetFile = null;
        if (typeof route.page_asset === 'string' && route.page_asset.length > 0) {
            const assetSourcePath = join(staticDir, route.page_asset.replace(/^\//, ''));
            const assetFileName = basename(assetSourcePath);
            if (await copyOptionalFile(assetSourcePath, join(routeDir, 'route', assetFileName))) {
                pageAssetFile = assetFileName;
            }
        }

        let imageManifestFile = null;
        if (await copyOptionalFile(imageManifestSource, join(routeDir, 'route', 'image-manifest.json'))) {
            imageManifestFile = 'image-manifest.json';
        }

        await writeRouteModulePackage({
            projectRoot,
            routeDir,
            route
        });

        const meta = {
            name,
            path: route.path,
            output: route.output,
            base_path: basePath,
            page_asset: route.page_asset || null,
            page_asset_file: pageAssetFile,
            route_id: route.route_id || null,
            server_script_path: route.server_script_path || null,
            guard_module_ref: route.guard_module_ref || null,
            load_module_ref: route.load_module_ref || null,
            has_guard: route.has_guard === true,
            has_load: route.has_load === true,
            params: extractRouteParams(route.path),
            image_manifest_file: imageManifestFile,
            image_config: config?.images || {}
        };
        await writeFile(join(routeDir, 'route.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
        emittedRoutes.push(meta);
    }

    await writeFile(
        join(serverDir, 'manifest.json'),
        `${JSON.stringify({ base_path: basePath, routes: emittedRoutes }, null, 2)}\n`,
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
