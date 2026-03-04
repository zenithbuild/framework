import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

interface CompilerPlatformPackage {
    packageName: string;
    binaryName: string;
    os: NodeJS.Platform;
    arch: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const PLATFORM_PACKAGES: Record<string, CompilerPlatformPackage> = {
    'darwin-arm64': {
        packageName: '@zenithbuild/compiler-darwin-arm64',
        binaryName: 'zenith-compiler',
        os: 'darwin',
        arch: 'arm64'
    },
    'darwin-x64': {
        packageName: '@zenithbuild/compiler-darwin-x64',
        binaryName: 'zenith-compiler',
        os: 'darwin',
        arch: 'x64'
    },
    'linux-x64': {
        packageName: '@zenithbuild/compiler-linux-x64',
        binaryName: 'zenith-compiler',
        os: 'linux',
        arch: 'x64'
    },
    'win32-x64': {
        packageName: '@zenithbuild/compiler-win32-x64',
        binaryName: 'zenith-compiler.exe',
        os: 'win32',
        arch: 'x64'
    }
};

function safeResolvePackageRoot(packageName: string): string | null {
    try {
        return path.dirname(require.resolve(`${packageName}/package.json`));
    } catch {
        return null;
    }
}

function currentPlatformPackage(): CompilerPlatformPackage | null {
    return PLATFORM_PACKAGES[`${process.platform}-${process.arch}`] || null;
}

function resolveLegacyCompilerBin(): string | null {
    const legacyBinary = path.resolve(
        __dirname,
        '..',
        'target',
        'release',
        process.platform === 'win32' ? 'zenith-compiler.exe' : 'zenith-compiler'
    );
    return existsSync(legacyBinary) ? legacyBinary : null;
}

export function resolveCompilerBin(): string {
    const platformPackage = currentPlatformPackage();
    if (platformPackage) {
        const packageRoot = safeResolvePackageRoot(platformPackage.packageName);
        if (packageRoot) {
            const binaryPath = path.resolve(packageRoot, 'bin', platformPackage.binaryName);
            if (existsSync(binaryPath)) {
                return binaryPath;
            }
        }
    }

    const legacyBinary = resolveLegacyCompilerBin();
    if (legacyBinary) {
        return legacyBinary;
    }

    const supportedPlatforms = Object.keys(PLATFORM_PACKAGES).join(', ');
    const expectedPackage = platformPackage?.packageName || '@zenithbuild/compiler-<platform>';
    throw new Error(
        `[zenith] Compiler binary not installed for ${process.platform}-${process.arch}. ` +
        `Reinstall @zenithbuild/compiler and ensure ${expectedPackage} is present. ` +
        `Supported platform packages: ${supportedPlatforms}.`
    );
}

/**
 * Compile Zenith source.
 *
 * Back-compat: compile(filePath) reads from file.
 * New mode: compile({ source, filePath }) or compile(source, filePath) uses stdin.
 */
export function compile(
    entryPathOrSource: string | { source: string; filePath: string },
    filePathOrOptions: string | object = {}
): Record<string, unknown> {
    const bin = resolveCompilerBin();
    let args: string[];
    const spawnOptions: {
        encoding: 'utf8';
        input?: string;
    } = { encoding: 'utf8' };

    if (
        typeof entryPathOrSource === 'object'
        && entryPathOrSource !== null
        && 'source' in entryPathOrSource
        && 'filePath' in entryPathOrSource
    ) {
        args = ['--stdin', entryPathOrSource.filePath];
        spawnOptions.input = entryPathOrSource.source;
    } else if (typeof entryPathOrSource === 'string' && typeof filePathOrOptions === 'string') {
        args = ['--stdin', filePathOrOptions];
        spawnOptions.input = entryPathOrSource;
    } else {
        args = [String(entryPathOrSource)];
    }

    const result = spawnSync(bin, args, spawnOptions);

    if (result.error) {
        throw new Error(result.error.message);
    }
    if (result.status !== 0) {
        throw new Error(result.stderr || 'Compiler execution failed');
    }

    return JSON.parse(result.stdout);
}
