import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_ROOT = resolve(__dirname, '..');
const localRequire = createRequire(import.meta.url);

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

export function resolveBinary(candidates) {
    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            return candidate;
        }
    }
    return candidates[0] || '';
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

export function compilerBinCandidates(projectRoot = null) {
    const candidates = [
        resolve(CLI_ROOT, '../compiler/target/release/zenith-compiler'),
        resolve(CLI_ROOT, '../zenith-compiler/target/release/zenith-compiler')
    ];
    const installedRoot = resolvePackageRoot('@zenithbuild/compiler', projectRoot);
    if (installedRoot) {
        candidates.unshift(resolve(installedRoot, 'target/release/zenith-compiler'));
    }
    return candidates;
}

export function resolveCompilerBin(projectRoot = null) {
    return resolveBinary(compilerBinCandidates(projectRoot));
}

export function bundlerBinCandidates(projectRoot = null, env = process.env) {
    const candidates = [];
    const envBin = env?.ZENITH_BUNDLER_BIN;
    if (typeof envBin === 'string' && envBin.length > 0) {
        candidates.push(envBin);
    }

    const installedRoot = resolvePackageRoot('@zenithbuild/bundler', projectRoot);
    if (installedRoot) {
        candidates.push(resolve(installedRoot, 'target/release/zenith-bundler'));
    }

    candidates.push(
        resolve(CLI_ROOT, '../bundler/target/release/zenith-bundler'),
        resolve(CLI_ROOT, '../zenith-bundler/target/release/zenith-bundler')
    );

    return candidates;
}

export function resolveBundlerBin(projectRoot = null, env = process.env) {
    return resolveBinary(bundlerBinCandidates(projectRoot, env));
}
