import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { bundlerCommandCandidates, compilerCommandCandidates } from './toolchain-paths.js';

const FALLBACK_LOG_KEYS = new Set();
const INCOMPATIBLE_ERROR_CODES = new Set(['ENOEXEC', 'EACCES']);
const INCOMPATIBLE_STDERR_PATTERNS = [
    /exec format error/i,
    /bad cpu type/i,
    /cannot execute binary file/i
];

function currentPlatformLabel() {
    return `${process.platform}-${process.arch}`;
}

function toolEnvVar(tool) {
    return tool === 'bundler' ? 'ZENITH_BUNDLER_BIN' : 'ZENITH_COMPILER_BIN';
}

function candidateExists(candidate) {
    if (!candidate) {
        return false;
    }
    if (candidate.mode === 'node-bridge') {
        const [runnerPath] = Array.isArray(candidate.argsPrefix) ? candidate.argsPrefix : [];
        return existsSync(candidate.path) && typeof runnerPath === 'string' && existsSync(runnerPath);
    }
    return typeof candidate.path === 'string' && candidate.path.length > 0 && existsSync(candidate.path);
}

function candidateSupportsArgs(candidate, args) {
    if (!candidate || candidate.mode !== 'node-bridge') {
        return true;
    }
    return !args.includes('--embedded-markup-expressions') && !args.includes('--strict-dom-lints');
}

function isBinaryIncompatible(result) {
    const errorCode = result?.error?.code;
    if (typeof errorCode === 'string' && INCOMPATIBLE_ERROR_CODES.has(errorCode)) {
        return true;
    }

    const stderr = `${result?.stderr || ''}\n${result?.error?.message || ''}`;
    return INCOMPATIBLE_STDERR_PATTERNS.some((pattern) => pattern.test(stderr));
}

function emitFallbackWarning(toolchain, nextCandidate) {
    const message = `[zenith] ${toolchain.tool} binary incompatible for this platform; falling back to ${nextCandidate.label}`;
    const onceKey = `toolchain-fallback:${toolchain.tool}:${nextCandidate.sourceKey}`;
    if (toolchain.logger && typeof toolchain.logger.warn === 'function') {
        toolchain.logger.warn(message, { onceKey });
        return;
    }
    if (FALLBACK_LOG_KEYS.has(onceKey)) {
        return;
    }
    FALLBACK_LOG_KEYS.add(onceKey);
    console.warn(message);
}

function incompatibleBinaryError(toolchain) {
    return new Error(
        `[zenith] ${toolchain.tool} binary is incompatible for ${currentPlatformLabel()}; ` +
        `reinstall or set ${toolEnvVar(toolchain.tool)}=...`
    );
}

function toolchainProbeError(toolchain, result) {
    const detail = result?.error?.message
        || String(result?.stderr || '').trim()
        || `exit code ${result?.status ?? 'unknown'}`;
    return new Error(`[zenith] ${toolchain.tool} probe failed: ${detail}`);
}

function buildToolchainState(tool, candidates, logger = null) {
    const explicitIndex = candidates.findIndex((candidate) => candidate?.explicit === true);
    const initialIndex = explicitIndex >= 0
        ? explicitIndex
        : candidates.findIndex((candidate) => candidateExists(candidate));
    return {
        tool,
        logger,
        candidates,
        activeIndex: initialIndex >= 0 ? initialIndex : 0
    };
}

function findNextFallbackIndex(toolchain, args) {
    for (let index = toolchain.activeIndex + 1; index < toolchain.candidates.length; index += 1) {
        const candidate = toolchain.candidates[index];
        if (!candidateExists(candidate)) {
            continue;
        }
        if (!candidateSupportsArgs(candidate, args)) {
            continue;
        }
        return index;
    }
    return -1;
}

function activeCandidate(toolchain) {
    return toolchain.candidates[toolchain.activeIndex] || null;
}

function runCandidateSync(candidate, args, spawnOptions) {
    return spawnSync(candidate.command, [...candidate.argsPrefix, ...args], spawnOptions);
}

export function createCompilerToolchain({ projectRoot = null, env = process.env, logger = null } = {}) {
    return buildToolchainState('compiler', compilerCommandCandidates(projectRoot, env), logger);
}

export function createBundlerToolchain({ projectRoot = null, env = process.env, logger = null } = {}) {
    return buildToolchainState('bundler', bundlerCommandCandidates(projectRoot, env), logger);
}

export function createToolchainStateForTests(tool, candidates, logger = null) {
    return buildToolchainState(tool, candidates, logger);
}

export function resetToolchainWarningsForTests() {
    FALLBACK_LOG_KEYS.clear();
}

export function getActiveToolchainCandidate(toolchain) {
    return activeCandidate(toolchain);
}

export function ensureToolchainCompatibility(toolchain, probeArgs = ['--version']) {
    while (toolchain.activeIndex < toolchain.candidates.length) {
        const candidate = activeCandidate(toolchain);
        if (!candidate) {
            break;
        }
        if (!candidateSupportsArgs(candidate, probeArgs)) {
            const nextIndex = findNextFallbackIndex(toolchain, probeArgs);
            if (nextIndex === -1) {
                throw incompatibleBinaryError(toolchain);
            }
            toolchain.activeIndex = nextIndex;
            emitFallbackWarning(toolchain, toolchain.candidates[nextIndex]);
            continue;
        }

        const result = runCandidateSync(candidate, probeArgs, { encoding: 'utf8' });
        if (!isBinaryIncompatible(result)) {
            if (result.error || result.status !== 0) {
                throw toolchainProbeError(toolchain, result);
            }
            return candidate;
        }

        const nextIndex = findNextFallbackIndex(toolchain, probeArgs);
        if (nextIndex === -1) {
            throw incompatibleBinaryError(toolchain);
        }
        toolchain.activeIndex = nextIndex;
        emitFallbackWarning(toolchain, toolchain.candidates[nextIndex]);
    }

    throw incompatibleBinaryError(toolchain);
}

export function runToolchainSync(toolchain, args, spawnOptions = {}) {
    while (toolchain.activeIndex < toolchain.candidates.length) {
        const candidate = activeCandidate(toolchain);
        if (!candidate) {
            break;
        }
        if (!candidateSupportsArgs(candidate, args)) {
            const nextIndex = findNextFallbackIndex(toolchain, args);
            if (nextIndex === -1) {
                throw incompatibleBinaryError(toolchain);
            }
            toolchain.activeIndex = nextIndex;
            emitFallbackWarning(toolchain, toolchain.candidates[nextIndex]);
            continue;
        }

        const result = runCandidateSync(candidate, args, spawnOptions);
        if (!isBinaryIncompatible(result)) {
            return { result, candidate };
        }

        const nextIndex = findNextFallbackIndex(toolchain, args);
        if (nextIndex === -1) {
            throw incompatibleBinaryError(toolchain);
        }
        toolchain.activeIndex = nextIndex;
        emitFallbackWarning(toolchain, toolchain.candidates[nextIndex]);
    }

    throw incompatibleBinaryError(toolchain);
}
