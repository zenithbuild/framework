import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

export interface BundlerPlatformPackage {
    packageName: string;
    binaryName: string;
    os: NodeJS.Platform;
    arch: string;
}

const PLATFORM_PACKAGES: Record<string, BundlerPlatformPackage> = {
    'darwin-arm64': {
        packageName: '@zenithbuild/bundler-darwin-arm64',
        binaryName: 'zenith-bundler',
        os: 'darwin',
        arch: 'arm64'
    },
    'darwin-x64': {
        packageName: '@zenithbuild/bundler-darwin-x64',
        binaryName: 'zenith-bundler',
        os: 'darwin',
        arch: 'x64'
    },
    'linux-x64': {
        packageName: '@zenithbuild/bundler-linux-x64',
        binaryName: 'zenith-bundler',
        os: 'linux',
        arch: 'x64'
    },
    'win32-x64': {
        packageName: '@zenithbuild/bundler-win32-x64',
        binaryName: 'zenith-bundler.exe',
        os: 'win32',
        arch: 'x64'
    }
};

function safeCreateRequire(projectRoot?: string | null): NodeRequire {
    if (!projectRoot) {
        return createRequire(import.meta.url);
    }
    try {
        return createRequire(resolve(projectRoot, 'package.json'));
    } catch {
        return createRequire(import.meta.url);
    }
}

function safeResolvePackageRoot(packageName: string, projectRoot?: string | null): string | null {
    const requireFn = safeCreateRequire(projectRoot);
    try {
        return dirname(requireFn.resolve(`${packageName}/package.json`));
    } catch {
        return null;
    }
}

export function getBundlerPlatformPackage(
    platform: NodeJS.Platform = process.platform,
    arch: string = process.arch
): BundlerPlatformPackage | null {
    return PLATFORM_PACKAGES[`${platform}-${arch}`] || null;
}

export function resolveBundlerPlatformPackageRoot(projectRoot?: string | null): string | null {
    const platformPackage = getBundlerPlatformPackage();
    if (!platformPackage) {
        return null;
    }
    return safeResolvePackageRoot(platformPackage.packageName, projectRoot);
}

export function resolveBundlerBin(projectRoot?: string | null): string | null {
    const platformPackage = getBundlerPlatformPackage();
    if (!platformPackage) {
        return null;
    }

    const packageRoot = resolveBundlerPlatformPackageRoot(projectRoot);
    if (!packageRoot) {
        return null;
    }

    const binaryPath = resolve(packageRoot, 'bin', platformPackage.binaryName);
    return existsSync(binaryPath) ? binaryPath : null;
}

export function resolveLegacyBundlerBin(projectRoot?: string | null): string | null {
    const packageRoot = safeResolvePackageRoot('@zenithbuild/bundler', projectRoot);
    if (!packageRoot) {
        return null;
    }

    const legacyBinary = resolve(
        packageRoot,
        'target',
        'release',
        process.platform === 'win32' ? 'zenith-bundler.exe' : 'zenith-bundler'
    );
    return existsSync(legacyBinary) ? legacyBinary : null;
}
