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
const MISSING_SCOPED_RUNTIME_ERROR =
    '[Zenith:ScopedServerData] Compiled scoped server data runtime is missing from server output.';
const MISSING_SCOPED_MODULES_ERROR =
    '[Zenith:ScopedServerData] Compiled scoped server data modules are missing from server output.';

interface HostedPageRuntimeOptions {
    includeScopedServerData?: boolean;
}

interface ServerManifest {
    global_middleware?: {
        module?: unknown;
    };
}

function createSharpRuntimeSource(): string {
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

async function readServerManifest(coreOutput: string): Promise<ServerManifest | null> {
    try {
        return JSON.parse(await readFile(join(coreOutput, 'server', 'manifest.json'), 'utf8'));
    } catch {
        return null;
    }
}

function normalizeGlobalMiddlewareModulePath(modulePath: unknown): string {
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

async function assertPathExists(filePath: string, message: string): Promise<void> {
    try {
        await stat(filePath);
    } catch {
        throw new Error(message);
    }
}

async function copyHostedScopedServerDataRuntime(coreOutput: string, targetDir: string): Promise<void> {
    const serverDir = join(coreOutput, 'server');
    const runtimeRoot = join(serverDir, 'scoped-server-data');
    const scopedRoot = join(serverDir, 'scoped');
    await assertPathExists(runtimeRoot, MISSING_SCOPED_RUNTIME_ERROR);
    await assertPathExists(scopedRoot, MISSING_SCOPED_MODULES_ERROR);
    await cp(runtimeRoot, join(targetDir, 'scoped-server-data'), { recursive: true, force: true });
    await cp(scopedRoot, join(targetDir, 'scoped'), { recursive: true, force: true });
}

export async function copyHostedPageRuntime(
    coreOutput: string,
    targetDir: string,
    options: HostedPageRuntimeOptions = {}
): Promise<void> {
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

    if (options.includeScopedServerData === true) {
        await copyHostedScopedServerDataRuntime(coreOutput, targetDir);
    }
}

export async function copyHostedGlobalMiddlewareRuntime(coreOutput: string, targetDir: string): Promise<string | null> {
    const manifest = await readServerManifest(coreOutput);
    const modulePath = manifest?.global_middleware?.module;
    if (modulePath == null) {
        return null;
    }

    const normalizedModulePath = normalizeGlobalMiddlewareModulePath(modulePath);
    const serverDir = join(coreOutput, 'server');
    const middlewareRoot = join(serverDir, 'global-middleware');
    await assertPathExists(middlewareRoot, MISSING_GLOBAL_MIDDLEWARE_RUNTIME_ERROR);
    await assertPathExists(join(serverDir, normalizedModulePath), MISSING_GLOBAL_MIDDLEWARE_RUNTIME_ERROR);
    await cp(middlewareRoot, join(targetDir, 'global-middleware'), {
        recursive: true,
        force: true
    });
    return normalizedModulePath;
}
