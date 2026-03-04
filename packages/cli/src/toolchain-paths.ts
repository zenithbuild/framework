import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type ToolchainTool = 'compiler' | 'bundler';
export type ToolchainMode = 'binary' | 'node-bridge';

export interface ToolchainCandidate {
    tool: ToolchainTool;
    mode: ToolchainMode;
    source: string;
    sourceKey: string;
    label: string;
    path: string;
    command: string;
    argsPrefix: string[];
    explicit?: boolean;
}

interface PlatformPackageDefinition {
    packageName: string;
    binaryName: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_ROOT = resolve(__dirname, '..');
const localRequire = createRequire(import.meta.url);
const IS_WINDOWS = process.platform === 'win32';
const COMPILER_BRIDGE_RUNNER = resolve(__dirname, 'compiler-bridge-runner.js');

const COMPILER_PLATFORM_PACKAGES: Record<string, PlatformPackageDefinition> = {
    'darwin-arm64': {
        packageName: '@zenithbuild/compiler-darwin-arm64',
        binaryName: 'zenith-compiler'
    },
    'darwin-x64': {
        packageName: '@zenithbuild/compiler-darwin-x64',
        binaryName: 'zenith-compiler'
    },
    'linux-x64': {
        packageName: '@zenithbuild/compiler-linux-x64',
        binaryName: 'zenith-compiler'
    },
    'win32-x64': {
        packageName: '@zenithbuild/compiler-win32-x64',
        binaryName: 'zenith-compiler.exe'
    }
};

const BUNDLER_PLATFORM_PACKAGES: Record<string, PlatformPackageDefinition> = {
    'darwin-arm64': {
        packageName: '@zenithbuild/bundler-darwin-arm64',
        binaryName: 'zenith-bundler'
    },
    'darwin-x64': {
        packageName: '@zenithbuild/bundler-darwin-x64',
        binaryName: 'zenith-bundler'
    },
    'linux-x64': {
        packageName: '@zenithbuild/bundler-linux-x64',
        binaryName: 'zenith-bundler'
    },
    'win32-x64': {
        packageName: '@zenithbuild/bundler-win32-x64',
        binaryName: 'zenith-bundler.exe'
    }
};

function safeCreateRequire(projectRoot: string | null | undefined): NodeRequire {
    if (!projectRoot) {
        return localRequire;
    }
    try {
        return createRequire(resolve(projectRoot, 'package.json'));
    } catch {
        return localRequire;
    }
}

function safeResolve(requireFn: NodeRequire, specifier: string): string | null {
    try {
        return requireFn.resolve(specifier);
    } catch {
        return null;
    }
}

function resolveExecutablePath(candidatePath: string): string {
    if (typeof candidatePath !== 'string' || candidatePath.length === 0) {
        return '';
    }
    if (!IS_WINDOWS || candidatePath.toLowerCase().endsWith('.exe')) {
        return candidatePath;
    }

    if (existsSync(candidatePath)) {
        return candidatePath;
    }

    const exePath = `${candidatePath}.exe`;
    return existsSync(exePath) ? exePath : candidatePath;
}

function createBinaryCandidate(
    tool: ToolchainTool,
    source: string,
    candidatePath: string
): ToolchainCandidate {
    const resolvedPath = resolveExecutablePath(candidatePath);
    return {
        tool,
        mode: 'binary',
        source,
        sourceKey: `${tool}:${source}:${resolvedPath}`,
        label: source,
        path: resolvedPath,
        command: resolvedPath,
        argsPrefix: []
    };
}

function createCompilerBridgeCandidate(modulePath: string): ToolchainCandidate | null {
    if (typeof modulePath !== 'string' || modulePath.length === 0) {
        return null;
    }
    return {
        tool: 'compiler',
        mode: 'node-bridge',
        source: 'JS bridge',
        sourceKey: `compiler:js-bridge:${modulePath}`,
        label: 'JS bridge',
        path: modulePath,
        command: process.execPath,
        argsPrefix: [COMPILER_BRIDGE_RUNNER, '--bridge-module', modulePath]
    };
}

function currentPlatformPackage(
    packages: Record<string, PlatformPackageDefinition>
): PlatformPackageDefinition | null {
    return packages[`${process.platform}-${process.arch}`] || null;
}

export function resolveBinary(candidates: Array<string | ToolchainCandidate>): string {
    for (const candidate of candidates) {
        const path = typeof candidate === 'string' ? candidate : candidate.path;
        if (path && existsSync(path)) {
            return path;
        }
    }

    const first = candidates[0];
    if (typeof first === 'string') {
        return first;
    }
    return first?.path || '';
}

export function resolvePackageRoot(packageName: string, projectRoot: string | null = null): string | null {
    const projectRequire = safeCreateRequire(projectRoot);
    const projectPath = safeResolve(projectRequire, `${packageName}/package.json`);
    if (projectPath) {
        return dirname(projectPath);
    }

    const localPath = safeResolve(localRequire, `${packageName}/package.json`);
    return localPath ? dirname(localPath) : null;
}

export function readInstalledPackageVersion(packageName: string, projectRoot: string | null = null): string | null {
    const packageRoot = resolvePackageRoot(packageName, projectRoot);
    if (!packageRoot) {
        return null;
    }
    try {
        const pkg = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as { version?: unknown };
        return typeof pkg.version === 'string' ? pkg.version : null;
    } catch {
        return null;
    }
}

export function readCliPackageVersion(): string {
    try {
        const pkg = JSON.parse(readFileSync(resolve(CLI_ROOT, 'package.json'), 'utf8')) as { version?: unknown };
        return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
    } catch {
        return '0.0.0';
    }
}

function createInstalledPlatformPackageCandidate(
    tool: ToolchainTool,
    packages: Record<string, PlatformPackageDefinition>,
    projectRoot: string | null
): ToolchainCandidate | null {
    const platformPackage = currentPlatformPackage(packages);
    if (!platformPackage) {
        return null;
    }

    const platformPackageRoot = resolvePackageRoot(platformPackage.packageName, projectRoot);
    if (!platformPackageRoot) {
        return null;
    }

    return createBinaryCandidate(
        tool,
        'installed platform package binary',
        resolve(platformPackageRoot, 'bin', platformPackage.binaryName)
    );
}

function createLegacyInstalledPackageCandidate(
    tool: ToolchainTool,
    packageName: string,
    binaryName: string,
    projectRoot: string | null
): ToolchainCandidate | null {
    const installedRoot = resolvePackageRoot(packageName, projectRoot);
    if (!installedRoot) {
        return null;
    }

    return createBinaryCandidate(
        tool,
        'legacy installed package binary',
        resolve(installedRoot, 'target', 'release', binaryName)
    );
}

function compilerWorkspaceBinaryCandidates(): ToolchainCandidate[] {
    return [
        createBinaryCandidate('compiler', 'workspace binary', resolve(CLI_ROOT, '../compiler/target/release/zenith-compiler')),
        createBinaryCandidate('compiler', 'workspace binary', resolve(CLI_ROOT, '../zenith-compiler/target/release/zenith-compiler'))
    ];
}

function bundlerWorkspaceBinaryCandidates(): ToolchainCandidate[] {
    return [
        createBinaryCandidate('bundler', 'workspace binary', resolve(CLI_ROOT, '../bundler/target/release/zenith-bundler')),
        createBinaryCandidate('bundler', 'workspace binary', resolve(CLI_ROOT, '../zenith-bundler/target/release/zenith-bundler'))
    ];
}

export function compilerCommandCandidates(
    projectRoot: string | null = null,
    env: NodeJS.ProcessEnv = process.env
): ToolchainCandidate[] {
    const candidates: ToolchainCandidate[] = [];
    const envBin = env.ZENITH_COMPILER_BIN;
    if (typeof envBin === 'string' && envBin.length > 0) {
        candidates.push({
            ...createBinaryCandidate('compiler', 'env override (ZENITH_COMPILER_BIN)', envBin),
            explicit: true
        });
    }

    const platformCandidate = createInstalledPlatformPackageCandidate('compiler', COMPILER_PLATFORM_PACKAGES, projectRoot);
    if (platformCandidate) {
        candidates.push(platformCandidate);
    }

    const legacyCandidate = createLegacyInstalledPackageCandidate(
        'compiler',
        '@zenithbuild/compiler',
        IS_WINDOWS ? 'zenith-compiler.exe' : 'zenith-compiler',
        projectRoot
    );
    if (legacyCandidate) {
        candidates.push(legacyCandidate);
    }

    candidates.push(...compilerWorkspaceBinaryCandidates());

    const installedRoot = resolvePackageRoot('@zenithbuild/compiler', projectRoot);
    if (installedRoot) {
        const bridgeCandidate = createCompilerBridgeCandidate(resolve(installedRoot, 'dist/index.js'));
        if (bridgeCandidate) {
            candidates.push(bridgeCandidate);
        }
    }

    return candidates;
}

export function compilerBinCandidates(projectRoot: string | null = null, env: NodeJS.ProcessEnv = process.env): string[] {
    return compilerCommandCandidates(projectRoot, env)
        .filter((candidate) => candidate.mode === 'binary')
        .map((candidate) => candidate.path);
}

export function resolveCompilerBin(projectRoot: string | null = null, env: NodeJS.ProcessEnv = process.env): string {
    return resolveBinary(compilerBinCandidates(projectRoot, env));
}

export function bundlerCommandCandidates(
    projectRoot: string | null = null,
    env: NodeJS.ProcessEnv = process.env
): ToolchainCandidate[] {
    const candidates: ToolchainCandidate[] = [];
    const envBin = env.ZENITH_BUNDLER_BIN;
    if (typeof envBin === 'string' && envBin.length > 0) {
        candidates.push({
            ...createBinaryCandidate('bundler', 'env override (ZENITH_BUNDLER_BIN)', envBin),
            explicit: true
        });
    }

    const platformCandidate = createInstalledPlatformPackageCandidate('bundler', BUNDLER_PLATFORM_PACKAGES, projectRoot);
    if (platformCandidate) {
        candidates.push(platformCandidate);
    }

    const legacyCandidate = createLegacyInstalledPackageCandidate(
        'bundler',
        '@zenithbuild/bundler',
        IS_WINDOWS ? 'zenith-bundler.exe' : 'zenith-bundler',
        projectRoot
    );
    if (legacyCandidate) {
        candidates.push(legacyCandidate);
    }

    candidates.push(...bundlerWorkspaceBinaryCandidates());
    return candidates;
}

export function resolveBundlerBin(projectRoot: string | null = null, env: NodeJS.ProcessEnv = process.env): string {
    return resolveBinary(
        bundlerCommandCandidates(projectRoot, env)
            .filter((candidate) => candidate.mode === 'binary')
            .map((candidate) => candidate.path)
    );
}

export function bundlerBinCandidates(projectRoot: string | null = null, env: NodeJS.ProcessEnv = process.env): string[] {
    return bundlerCommandCandidates(projectRoot, env)
        .filter((candidate) => candidate.mode === 'binary')
        .map((candidate) => candidate.path);
}
