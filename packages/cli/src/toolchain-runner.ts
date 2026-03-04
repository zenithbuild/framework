import { spawnSync } from 'node:child_process';
import type { SpawnSyncOptionsWithStringEncoding, SpawnSyncReturns } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
    bundlerCommandCandidates,
    compilerCommandCandidates,
    type ToolchainCandidate,
    type ToolchainTool
} from './toolchain-paths.js';

export interface ToolchainLogger {
    warn?: (message: string, options?: { onceKey?: string }) => void;
}

export interface ToolchainState {
    tool: ToolchainTool;
    logger: ToolchainLogger | null;
    candidates: ToolchainCandidate[];
    activeIndex: number;
}

type SpawnResult = SpawnSyncReturns<string>;

const FALLBACK_LOG_KEYS = new Set<string>();
const INCOMPATIBLE_ERROR_CODES = new Set(['ENOEXEC', 'EACCES']);
const INCOMPATIBLE_STDERR_PATTERNS = [
    /exec format error/i,
    /bad cpu type/i,
    /cannot execute binary file/i,
    /not a valid win32 application/i
];
const INSTALL_COMPATIBILITY_DOC =
    'https://github.com/zenithbuild/framework/blob/master/docs/documentation/install-compatibility.md';

function currentPlatformLabel(): string {
    return `${process.platform}-${process.arch}`;
}

function toolEnvVar(tool: ToolchainTool): string {
    return tool === 'bundler' ? 'ZENITH_BUNDLER_BIN' : 'ZENITH_COMPILER_BIN';
}

function candidateExists(candidate: ToolchainCandidate | null | undefined): boolean {
    if (!candidate) {
        return false;
    }
    if (candidate.mode === 'node-bridge') {
        const [runnerPath] = candidate.argsPrefix;
        return existsSync(candidate.path) && typeof runnerPath === 'string' && existsSync(runnerPath);
    }
    return typeof candidate.path === 'string' && candidate.path.length > 0 && existsSync(candidate.path);
}

function candidateSupportsArgs(candidate: ToolchainCandidate | null | undefined, args: string[]): boolean {
    if (!candidate || candidate.mode !== 'node-bridge') {
        return true;
    }
    return !args.includes('--embedded-markup-expressions') && !args.includes('--strict-dom-lints');
}

function isBinaryIncompatible(result: SpawnResult): boolean {
    const error = result?.error as NodeJS.ErrnoException | undefined;
    const errorCode = error?.code;
    if (typeof errorCode === 'string' && INCOMPATIBLE_ERROR_CODES.has(errorCode)) {
        return true;
    }

    const stderr = `${result?.stderr || ''}\n${error?.message || ''}`;
    return INCOMPATIBLE_STDERR_PATTERNS.some((pattern) => pattern.test(stderr));
}

function emitFallbackWarning(toolchain: ToolchainState, nextCandidate: ToolchainCandidate): void {
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

function missingToolchainError(toolchain: ToolchainState): Error {
    if (toolchain.tool === 'bundler') {
        return new Error(
            `[zenith] Bundler binary not installed for ${process.platform}/${process.arch}. ` +
            `Reinstall @zenithbuild/bundler and ensure the matching platform package is installed. ` +
            `See ${INSTALL_COMPATIBILITY_DOC}.`
        );
    }

    return new Error(
        `[zenith] ${toolchain.tool} binary not installed for ${currentPlatformLabel()}; ` +
        `reinstall, ensure the matching platform package is installed, or set ${toolEnvVar(toolchain.tool)}=... ` +
        `See ${INSTALL_COMPATIBILITY_DOC}.`
    );
}

function incompatibleBinaryError(toolchain: ToolchainState): Error {
    return new Error(
        `[zenith] ${toolchain.tool} binary is incompatible for ${currentPlatformLabel()}; ` +
        `reinstall, clear the wrong-platform package, or set ${toolEnvVar(toolchain.tool)}=... ` +
        `See ${INSTALL_COMPATIBILITY_DOC}.`
    );
}

function toolchainProbeError(toolchain: ToolchainState, result: SpawnResult): Error {
    const detail = result?.error?.message
        || String(result?.stderr || '').trim()
        || `exit code ${result?.status ?? 'unknown'}`;
    return new Error(`[zenith] ${toolchain.tool} probe failed: ${detail}`);
}

function buildToolchainState(
    tool: ToolchainTool,
    candidates: ToolchainCandidate[],
    logger: ToolchainLogger | null = null
): ToolchainState {
    const explicitIndex = candidates.findIndex((candidate) => candidate.explicit === true);
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

function findNextFallbackIndex(toolchain: ToolchainState, args: string[]): number {
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

function activeCandidate(toolchain: ToolchainState): ToolchainCandidate | null {
    return toolchain.candidates[toolchain.activeIndex] || null;
}

function runCandidateSync(
    candidate: ToolchainCandidate,
    args: string[],
    spawnOptions: SpawnSyncOptionsWithStringEncoding
): SpawnResult {
    return spawnSync(candidate.command, [...candidate.argsPrefix, ...args], spawnOptions);
}

export function createCompilerToolchain(
    { projectRoot = null, env = process.env, logger = null }: {
        projectRoot?: string | null;
        env?: NodeJS.ProcessEnv;
        logger?: ToolchainLogger | null;
    } = {}
): ToolchainState {
    return buildToolchainState('compiler', compilerCommandCandidates(projectRoot, env), logger);
}

export function createBundlerToolchain(
    { projectRoot = null, env = process.env, logger = null }: {
        projectRoot?: string | null;
        env?: NodeJS.ProcessEnv;
        logger?: ToolchainLogger | null;
    } = {}
): ToolchainState {
    return buildToolchainState('bundler', bundlerCommandCandidates(projectRoot, env), logger);
}

export function createToolchainStateForTests(
    tool: ToolchainTool,
    candidates: ToolchainCandidate[],
    logger: ToolchainLogger | null = null
): ToolchainState {
    return buildToolchainState(tool, candidates, logger);
}

export function resetToolchainWarningsForTests(): void {
    FALLBACK_LOG_KEYS.clear();
}

export function getActiveToolchainCandidate(toolchain: ToolchainState): ToolchainCandidate | null {
    return activeCandidate(toolchain);
}

export function ensureToolchainCompatibility(
    toolchain: ToolchainState,
    probeArgs: string[] = ['--version']
): ToolchainCandidate {
    while (toolchain.activeIndex < toolchain.candidates.length) {
        const candidate = activeCandidate(toolchain);
        if (!candidate) {
            break;
        }
        if (!candidateExists(candidate)) {
            const nextIndex = findNextFallbackIndex(toolchain, probeArgs);
            if (nextIndex === -1) {
                throw missingToolchainError(toolchain);
            }
            toolchain.activeIndex = nextIndex;
            continue;
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

    throw missingToolchainError(toolchain);
}

export function runToolchainSync(
    toolchain: ToolchainState,
    args: string[],
    spawnOptions: SpawnSyncOptionsWithStringEncoding = { encoding: 'utf8' }
): { result: SpawnResult; candidate: ToolchainCandidate } {
    while (toolchain.activeIndex < toolchain.candidates.length) {
        const candidate = activeCandidate(toolchain);
        if (!candidate) {
            break;
        }
        if (!candidateExists(candidate)) {
            const nextIndex = findNextFallbackIndex(toolchain, args);
            if (nextIndex === -1) {
                throw missingToolchainError(toolchain);
            }
            toolchain.activeIndex = nextIndex;
            continue;
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

    throw missingToolchainError(toolchain);
}
