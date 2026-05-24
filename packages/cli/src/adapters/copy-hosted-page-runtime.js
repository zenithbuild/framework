import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';

const PACKAGE_REQUIRE = createRequire(import.meta.url);

const HOSTED_PAGE_RUNTIME_DIRS = ['runtime', 'images', 'auth', 'server-contract'];
const HOSTED_PAGE_RUNTIME_FILES = [
    'base-path.js',
    'server-contract.js',
    'server-middleware.js',
    'server-error.js',
    'resource-response.js',
    'download-result.js'
];
const INVALID_GLOBAL_MIDDLEWARE_MODULE_PATH_ERROR =
    '[Zenith:Middleware] Invalid global middleware module path in server manifest.';
const MISSING_GLOBAL_MIDDLEWARE_RUNTIME_ERROR =
    '[Zenith:Middleware] Compiled global middleware runtime is missing from server output.';

function createSharpRuntimeSource() {
    const sharpPath = PACKAGE_REQUIRE.resolve('sharp');
    const fallbackUrl = pathToFileURL(sharpPath).href;
    return [
        'async function loadSharp() {',
        '  try {',
        "    const mod = await import('sharp');",
        '    return mod.default || mod;',
        '  } catch {',
        `    const mod = await import(${JSON.stringify(fallbackUrl)});`,
        '    return mod.default || mod;',
        '  }',
        '}',
        '',
        'const sharp = await loadSharp();',
        'export default sharp;',
        ''
    ].join('\n');
}

async function readServerManifest(coreOutput) {
    try {
        return JSON.parse(await readFile(join(coreOutput, 'server', 'manifest.json'), 'utf8'));
    } catch {
        return null;
    }
}

function normalizeGlobalMiddlewareModulePath(modulePath) {
    if (typeof modulePath !== 'string' || modulePath.length === 0 || isAbsolute(modulePath) || /^[A-Za-z]:[\\/]/.test(modulePath)) {
        throw new Error(INVALID_GLOBAL_MIDDLEWARE_MODULE_PATH_ERROR);
    }
    if (modulePath.split(/[\\/]+/).includes('..')) {
        throw new Error(INVALID_GLOBAL_MIDDLEWARE_MODULE_PATH_ERROR);
    }
    const normalized = normalize(modulePath).replaceAll('\\', '/');
    if (
        normalized === '.' ||
        normalized.startsWith('../') ||
        normalized.includes('/../') ||
        !normalized.startsWith('global-middleware/')
    ) {
        throw new Error(INVALID_GLOBAL_MIDDLEWARE_MODULE_PATH_ERROR);
    }
    return normalized;
}

async function assertPathExists(filePath) {
    try {
        await stat(filePath);
    } catch {
        throw new Error(MISSING_GLOBAL_MIDDLEWARE_RUNTIME_ERROR);
    }
}

export async function copyHostedPageRuntime(coreOutput, targetDir) {
    const serverDir = join(coreOutput, 'server');
    await mkdir(targetDir, { recursive: true });

    for (const name of HOSTED_PAGE_RUNTIME_DIRS) {
        await cp(join(serverDir, name), join(targetDir, name), {
            recursive: true,
            force: true
        });
    }

    for (const name of HOSTED_PAGE_RUNTIME_FILES) {
        await cp(join(serverDir, name), join(targetDir, name), { force: true });
    }

    const imageServicePath = join(targetDir, 'images', 'service.js');
    const imageServiceSource = await readFile(imageServicePath, 'utf8');
    await writeFile(
        imageServicePath,
        imageServiceSource.replace("import sharp from 'sharp';", "import sharp from './sharp-runtime.js';"),
        'utf8'
    );
    await writeFile(join(targetDir, 'images', 'sharp-runtime.js'), createSharpRuntimeSource(), 'utf8');
}

export async function copyHostedGlobalMiddlewareRuntime(coreOutput, targetDir) {
    const manifest = await readServerManifest(coreOutput);
    const modulePath = manifest?.global_middleware?.module;
    if (modulePath == null) {
        return null;
    }

    const normalizedModulePath = normalizeGlobalMiddlewareModulePath(modulePath);
    const serverDir = join(coreOutput, 'server');
    const middlewareRoot = join(serverDir, 'global-middleware');
    await assertPathExists(middlewareRoot);
    await assertPathExists(join(serverDir, normalizedModulePath));
    await cp(middlewareRoot, join(targetDir, 'global-middleware'), {
        recursive: true,
        force: true
    });
    return normalizedModulePath;
}
