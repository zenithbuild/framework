import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_ROOT = resolve(__dirname, '..');
const localRequire = createRequire(import.meta.url);
const IS_WINDOWS = process.platform === 'win32';
const COMPILER_BRIDGE_RUNNER = resolve(__dirname, 'compiler-bridge-runner.js');

function safeCreateRequire(projectRoot) {
    if (!projectRoot) {
        return localRequire;
    }
    try {
        return createRequire(resolve(projectRoot, 'package.json'));
    } catch {
        return localRequire;
    }
}

function safeResolve(requireFn, specifier) {
    try {
        return requireFn.resolve(specifier);
    } catch {
        return null;
    }
}

function resolveExecutablePath(candidatePath) {
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

function createBinaryCandidate(tool, source, candidatePath) {
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

function createCompilerBridgeCandidate(modulePath) {
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

export function resolveBinary(candidates) {
    for (const candidate of candidates) {
        const path = typeof candidate === 'string'
            ? candidate
            : (typeof candidate?.path === 'string' ? candidate.path : '');
        if (path && existsSync(path)) {
            return path;
        }
    }
    const first = candidates[0];
    if (typeof first === 'string') {
        return first;
    }
    return typeof first?.path === 'string' ? first.path : '';
}

export function resolvePackageRoot(packageName, projectRoot = null) {
    const projectRequire = safeCreateRequire(projectRoot);
    const projectPath = safeResolve(projectRequire, `${packageName}/package.json`);
    if (projectPath) {
        return dirname(projectPath);
    }

    const localPath = safeResolve(localRequire, `${packageName}/package.json`);
    return localPath ? dirname(localPath) : null;
}

export function readInstalledPackageVersion(packageName, projectRoot = null) {
    const packageRoot = resolvePackageRoot(packageName, projectRoot);
    if (!packageRoot) {
        return null;
    }
    try {
        const pkg = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
        return typeof pkg.version === 'string' ? pkg.version : null;
    } catch {
        return null;
    }
}

export function readCliPackageVersion() {
    try {
        const pkg = JSON.parse(readFileSync(resolve(CLI_ROOT, 'package.json'), 'utf8'));
        return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
    } catch {
        return '0.0.0';
    }
}

function compilerWorkspaceBinaryCandidates() {
    return [
        createBinaryCandidate('compiler', 'workspace binary', resolve(CLI_ROOT, '../compiler/target/release/zenith-compiler')),
        createBinaryCandidate('compiler', 'workspace binary', resolve(CLI_ROOT, '../zenith-compiler/target/release/zenith-compiler'))
    ];
}

function bundlerWorkspaceBinaryCandidates() {
    return [
        createBinaryCandidate('bundler', 'workspace binary', resolve(CLI_ROOT, '../bundler/target/release/zenith-bundler')),
        createBinaryCandidate('bundler', 'workspace binary', resolve(CLI_ROOT, '../zenith-bundler/target/release/zenith-bundler'))
    ];
}

export function compilerCommandCandidates(projectRoot = null, env = process.env) {
    const candidates = [];
    const envBin = env?.ZENITH_COMPILER_BIN;
    if (typeof envBin === 'string' && envBin.length > 0) {
        candidates.push({
            ...createBinaryCandidate('compiler', 'env override (ZENITH_COMPILER_BIN)', envBin),
            explicit: true
        });
    }

    const installedRoot = resolvePackageRoot('@zenithbuild/compiler', projectRoot);
    if (installedRoot) {
        candidates.push(
            createBinaryCandidate('compiler', 'installed package binary', resolve(installedRoot, 'target/release/zenith-compiler'))
        );
    }

    candidates.push(...compilerWorkspaceBinaryCandidates());

    if (installedRoot) {
        const bridgeCandidate = createCompilerBridgeCandidate(resolve(installedRoot, 'dist/index.js'));
        if (bridgeCandidate) {
            candidates.push(bridgeCandidate);
        }
    }

    return candidates;
}

export function compilerBinCandidates(projectRoot = null, env = process.env) {
    return compilerCommandCandidates(projectRoot, env)
        .filter((candidate) => candidate.mode === 'binary')
        .map((candidate) => candidate.path);
}

export function resolveCompilerBin(projectRoot = null, env = process.env) {
    return resolveBinary(compilerBinCandidates(projectRoot, env));
}

export function bundlerCommandCandidates(projectRoot = null, env = process.env) {
    const candidates = [];
    const envBin = env?.ZENITH_BUNDLER_BIN;
    if (typeof envBin === 'string' && envBin.length > 0) {
        candidates.push({
            ...createBinaryCandidate('bundler', 'env override (ZENITH_BUNDLER_BIN)', envBin),
            explicit: true
        });
    }

    const installedRoot = resolvePackageRoot('@zenithbuild/bundler', projectRoot);
    if (installedRoot) {
        candidates.push(
            createBinaryCandidate('bundler', 'installed package binary', resolve(installedRoot, 'target/release/zenith-bundler'))
        );
    }

    candidates.push(...bundlerWorkspaceBinaryCandidates());
    return candidates;
}

export function resolveBundlerBin(projectRoot = null, env = process.env) {
    return resolveBinary(
        bundlerCommandCandidates(projectRoot, env)
            .filter((candidate) => candidate.mode === 'binary')
            .map((candidate) => candidate.path)
    );
}

export function bundlerBinCandidates(projectRoot = null, env = process.env) {
    return bundlerCommandCandidates(projectRoot, env)
        .filter((candidate) => candidate.mode === 'binary')
        .map((candidate) => candidate.path);
}
