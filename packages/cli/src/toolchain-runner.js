import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { bundlerCommandCandidates, compilerCommandCandidates } from './toolchain-paths.js';

/**
 * @typedef {'compiler' | 'bundler'} ToolchainTool
 * @typedef {{
 *   tool: ToolchainTool,
 *   mode: 'binary' | 'node-bridge',
 *   source: string,
 *   sourceKey: string,
 *   label: string,
 *   path: string,
 *   command: string,
 *   argsPrefix: string[],
 *   explicit?: boolean
 * }} ToolchainCandidate
 * @typedef {{ warn?: (message: string, options?: { onceKey?: string }) => void }} ToolchainLogger
 * @typedef {{
 *   tool: ToolchainTool,
 *   logger: ToolchainLogger | null,
 *   candidates: ToolchainCandidate[],
 *   activeIndex: number
 * }} ToolchainState
 * @typedef {import('node:child_process').SpawnSyncReturns<string>} SpawnResult
 */

const FALLBACK_LOG_KEYS = new Set();
const INCOMPATIBLE_ERROR_CODES = new Set(['ENOEXEC', 'EACCES']);
const INCOMPATIBLE_STDERR_PATTERNS = [
    /exec format error/i,
    /bad cpu type/i,
    /cannot execute binary file/i,
    /not a valid win32 application/i
];

function currentPlatformLabel() {
    return `${process.platform}-${process.arch}`;
}

/**
 * @param {ToolchainTool} tool
 * @returns {string}
 */
function toolEnvVar(tool) {
    return tool === 'bundler' ? 'ZENITH_BUNDLER_BIN' : 'ZENITH_COMPILER_BIN';
}

/**
 * @param {ToolchainCandidate | null | undefined} candidate
 * @returns {boolean}
 */
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

/**
 * @param {ToolchainCandidate | null | undefined} candidate
 * @param {string[]} args
 * @returns {boolean}
 */
function candidateSupportsArgs(candidate, args) {
    if (!candidate || candidate.mode !== 'node-bridge') {
        return true;
    }
    return !args.includes('--embedded-markup-expressions') && !args.includes('--strict-dom-lints');
}

/**
 * @param {SpawnResult} result
 * @returns {boolean}
 */
function isBinaryIncompatible(result) {
    const errorCode = /** @type {NodeJS.ErrnoException | undefined} */ (result?.error)?.code;
    if (typeof errorCode === 'string' && INCOMPATIBLE_ERROR_CODES.has(errorCode)) {
        return true;
    }

    const stderr = `${result?.stderr || ''}\n${result?.error?.message || ''}`;
    return INCOMPATIBLE_STDERR_PATTERNS.some((pattern) => pattern.test(stderr));
}

/**
 * @param {ToolchainState} toolchain
 * @param {ToolchainCandidate} nextCandidate
 * @returns {void}
 */
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

/**
 * @param {ToolchainState} toolchain
 * @returns {Error}
 */
function incompatibleBinaryError(toolchain) {
    return new Error(
        `[zenith] ${toolchain.tool} binary is incompatible for ${currentPlatformLabel()}; ` +
        `reinstall or set ${toolEnvVar(toolchain.tool)}=...`
    );
}

/**
 * @param {ToolchainState} toolchain
 * @param {SpawnResult} result
 * @returns {Error}
 */
function toolchainProbeError(toolchain, result) {
    const detail = result?.error?.message
        || String(result?.stderr || '').trim()
        || `exit code ${result?.status ?? 'unknown'}`;
    return new Error(`[zenith] ${toolchain.tool} probe failed: ${detail}`);
}

/**
 * @param {ToolchainTool} tool
 * @param {ToolchainCandidate[]} candidates
 * @param {ToolchainLogger | null} [logger]
 * @returns {ToolchainState}
 */
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

/**
 * @param {ToolchainState} toolchain
 * @param {string[]} args
 * @returns {number}
 */
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

/**
 * @param {ToolchainState} toolchain
 * @returns {ToolchainCandidate | null}
 */
function activeCandidate(toolchain) {
    return toolchain.candidates[toolchain.activeIndex] || null;
}

/**
 * @param {ToolchainCandidate} candidate
 * @param {string[]} args
 * @param {import('node:child_process').SpawnSyncOptionsWithStringEncoding} spawnOptions
 * @returns {SpawnResult}
 */
function runCandidateSync(candidate, args, spawnOptions) {
    return spawnSync(candidate.command, [...candidate.argsPrefix, ...args], spawnOptions);
}

/**
 * @param {{ projectRoot?: string | null, env?: NodeJS.ProcessEnv, logger?: ToolchainLogger | null }} [options]
 * @returns {ToolchainState}
 */
export function createCompilerToolchain({ projectRoot = null, env = process.env, logger = null } = {}) {
    return buildToolchainState('compiler', compilerCommandCandidates(projectRoot, env), logger);
}

/**
 * @param {{ projectRoot?: string | null, env?: NodeJS.ProcessEnv, logger?: ToolchainLogger | null }} [options]
 * @returns {ToolchainState}
 */
export function createBundlerToolchain({ projectRoot = null, env = process.env, logger = null } = {}) {
    return buildToolchainState('bundler', bundlerCommandCandidates(projectRoot, env), logger);
}

/**
 * @param {ToolchainTool} tool
 * @param {ToolchainCandidate[]} candidates
 * @param {ToolchainLogger | null} [logger]
 * @returns {ToolchainState}
 */
export function createToolchainStateForTests(tool, candidates, logger = null) {
    return buildToolchainState(tool, candidates, logger);
}

export function resetToolchainWarningsForTests() {
    FALLBACK_LOG_KEYS.clear();
}

/**
 * @param {ToolchainState} toolchain
 * @returns {ToolchainCandidate | null}
 */
export function getActiveToolchainCandidate(toolchain) {
    return activeCandidate(toolchain);
}

/**
 * @param {ToolchainState} toolchain
 * @param {string[]} [probeArgs]
 * @returns {ToolchainCandidate}
 */
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

/**
 * @param {ToolchainState} toolchain
 * @param {string[]} args
 * @param {import('node:child_process').SpawnSyncOptionsWithStringEncoding} [spawnOptions]
 * @returns {{ result: SpawnResult, candidate: ToolchainCandidate }}
 */
export function runToolchainSync(toolchain, args, spawnOptions = { encoding: 'utf8' }) {
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
