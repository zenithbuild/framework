import { spawn, spawnSync } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { join, relative } from 'node:path';
import { resolveBundlerBin } from '../toolchain-paths.js';
import {
    createCompilerToolchain,
    getActiveToolchainCandidate,
    runToolchainSync
} from '../toolchain-runner.js';

const require = createRequire(import.meta.url);
const COMPILER_SPAWN_MAX_BUFFER = 32 * 1024 * 1024;
let cachedTypeScript = undefined;

/**
 * @returns {import('typescript') | null}
 */
export function loadTypeScriptApi() {
    if (cachedTypeScript === undefined) {
        try {
            cachedTypeScript = require('typescript');
        } catch {
            cachedTypeScript = null;
        }
    }
    return cachedTypeScript;
}

/**
 * @param {(line: string) => void} sink
 * @returns {(line: string) => void}
 */
export function createCompilerWarningEmitter(sink = (line) => console.warn(line)) {
    const emitted = new Set();
    return (line) => {
        const text = String(line || '').trim();
        if (!text || emitted.has(text)) {
            return;
        }
        emitted.add(text);
        sink(text);
    };
}

/**
 * @param {import('node:stream').Readable | null | undefined} stream
 * @param {(line: string) => void} onLine
 */
function forwardStreamLines(stream, onLine) {
    if (!stream || typeof stream.on !== 'function') {
        return;
    }
    let pending = '';
    stream.setEncoding?.('utf8');
    stream.on('data', (chunk) => {
        pending += String(chunk || '');
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() || '';
        for (const line of lines) {
            if (line.trim().length > 0) {
                onLine(line);
            }
        }
    });
    stream.on('end', () => {
        if (pending.trim().length > 0) {
            onLine(pending);
        }
    });
}

/**
 * @param {string} filePath
 * @param {string} [stdinSource]
 * @param {object} [compilerOpts]
 * @param {object} [compilerRunOptions]
 * @param {(warning: string) => void} [compilerRunOptions.onWarning]
 * @param {boolean} [compilerRunOptions.suppressWarnings]
 * @param {string|object} [compilerRunOptions.compilerBin]
 * @param {object} [compilerRunOptions.compilerToolchain]
 * @returns {object}
 */
export function runCompiler(filePath, stdinSource, compilerOpts = {}, compilerRunOptions = {}) {
    const compilerToolchain = compilerRunOptions.compilerToolchain
        || (compilerRunOptions.compilerBin && typeof compilerRunOptions.compilerBin === 'object'
            ? compilerRunOptions.compilerBin
            : null);
    const compilerBin = !compilerToolchain && typeof compilerRunOptions.compilerBin === 'string'
        ? compilerRunOptions.compilerBin
        : null;
    const args = stdinSource !== undefined
        ? ['--stdin', filePath]
        : [filePath];
    if (compilerOpts?.experimentalEmbeddedMarkup) {
        args.push('--embedded-markup-expressions');
    }
    if (compilerOpts?.strictDomLints) {
        args.push('--strict-dom-lints');
    }
    const opts = {
        encoding: 'utf8',
        maxBuffer: COMPILER_SPAWN_MAX_BUFFER
    };
    if (stdinSource !== undefined) {
        opts.input = stdinSource;
    }

    const result = compilerToolchain
        ? runToolchainSync(compilerToolchain, args, opts).result
        : (compilerBin
            ? spawnSync(compilerBin, args, opts)
            : runToolchainSync(
                createCompilerToolchain({
                    logger: compilerRunOptions.logger || null
                }),
                args,
                opts
            ).result);

    if (result.error) {
        throw new Error(`Compiler spawn failed for ${filePath}: ${result.error.message}`);
    }
    if (result.status !== 0) {
        throw new Error(
            `Compiler failed for ${filePath} with exit code ${result.status}\n${result.stderr || ''}`
        );
    }

    if (result.stderr && result.stderr.trim().length > 0 && compilerRunOptions.suppressWarnings !== true) {
        const lines = String(result.stderr)
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
        for (const line of lines) {
            if (typeof compilerRunOptions.onWarning === 'function') {
                compilerRunOptions.onWarning(line);
            } else {
                console.warn(line);
            }
        }
    }

    try {
        return JSON.parse(result.stdout);
    } catch (err) {
        throw new Error(`Compiler emitted invalid JSON: ${err.message}`);
    }
}

/**
 * @param {string} source
 * @returns {string}
 */
export function stripStyleBlocks(source) {
    return String(source || '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
}

/**
 * @param {ReturnType<import('../startup-profile.js').createStartupProfiler>} startupProfile
 * @param {Record<string, number>} compilerTotals
 * @returns {(phase: 'page' | 'owner' | 'component', filePath: string, stdinSource: string | undefined, compilerOpts: object, compilerRunOptions: object) => object}
 */
export function createTimedCompilerRunner(startupProfile, compilerTotals) {
    return (phase, filePath, stdinSource, compilerOpts, compilerRunOptions) => {
        const startedAt = performance.now();
        const result = runCompiler(filePath, stdinSource, compilerOpts, compilerRunOptions);
        const durationMs = startupProfile.roundMs(performance.now() - startedAt);

        if (phase === 'page') {
            compilerTotals.pageMs += durationMs;
            compilerTotals.pageCalls += 1;
        } else if (phase === 'owner') {
            compilerTotals.ownerMs += durationMs;
            compilerTotals.ownerCalls += 1;
        } else if (phase === 'component') {
            compilerTotals.componentMs += durationMs;
            compilerTotals.componentCalls += 1;
        }

        return result;
    };
}

/**
 * @param {object|object[]} envelope
 * @param {string} outDir
 * @param {string} projectRoot
 * @param {object | null} [logger]
 * @param {boolean} [showInfo]
 * @param {string|object} [bundlerBin]
 * @param {{ devStableAssets?: boolean, rebuildStrategy?: 'full'|'bundle-only'|'page-only', changedRoutes?: string[], fastPath?: boolean, globalGraphHash?: string }} [bundlerOptions]
 * @returns {Promise<void>}
 */
export function runBundler(
    envelope,
    outDir,
    projectRoot,
    logger = null,
    showInfo = true,
    bundlerBin = resolveBundlerBin(projectRoot),
    bundlerOptions = {}
) {
    return new Promise((resolvePromise, rejectPromise) => {
        const useStructuredLogger = Boolean(logger && typeof logger.childLine === 'function');
        const bundlerToolchain = bundlerBin && typeof bundlerBin === 'object'
            ? bundlerBin
            : null;
        const bundlerCandidate = bundlerToolchain
            ? getActiveToolchainCandidate(bundlerToolchain)
            : null;
        const bundlerPath = bundlerCandidate?.command || bundlerBin;
        const bundlerArgs = [
            ...(Array.isArray(bundlerCandidate?.argsPrefix) ? bundlerCandidate.argsPrefix : []),
            '--out-dir',
            outDir
        ];
        if (bundlerOptions.devStableAssets === true) {
            bundlerArgs.push('--dev-stable-assets');
        }
        if (typeof bundlerOptions.rebuildStrategy === 'string' && bundlerOptions.rebuildStrategy.length > 0) {
            bundlerArgs.push('--rebuild-strategy', bundlerOptions.rebuildStrategy);
        }
        if (Array.isArray(bundlerOptions.changedRoutes)) {
            for (const route of bundlerOptions.changedRoutes) {
                const value = String(route || '').trim();
                if (value.length > 0) {
                    bundlerArgs.push('--changed-route', value);
                }
            }
        }
        if (bundlerOptions.fastPath === true) {
            bundlerArgs.push('--fast-path');
        }
        if (typeof bundlerOptions.globalGraphHash === 'string' && bundlerOptions.globalGraphHash.length > 0) {
            bundlerArgs.push('--global-graph-hash', bundlerOptions.globalGraphHash);
        }
        const child = spawn(
            bundlerPath,
            bundlerArgs,
            {
                cwd: projectRoot,
                stdio: useStructuredLogger ? ['pipe', 'pipe', 'pipe'] : ['pipe', 'inherit', 'inherit']
            }
        );

        if (useStructuredLogger) {
            forwardStreamLines(child.stdout, (line) => {
                logger.childLine('bundler', line, { stream: 'stdout', showInfo });
            });
            forwardStreamLines(child.stderr, (line) => {
                logger.childLine('bundler', line, { stream: 'stderr', showInfo: true });
            });
        }

        child.on('error', (err) => {
            rejectPromise(new Error(`Bundler spawn failed: ${err.message}`));
        });

        child.on('close', (code) => {
            if (code === 0) {
                resolvePromise();
                return;
            }
            rejectPromise(new Error(`Bundler failed with exit code ${code}`));
        });

        child.stdin.write(JSON.stringify(envelope));
        child.stdin.end();
    });
}

/**
 * @param {string} rootDir
 * @returns {Promise<string[]>}
 */
export async function collectAssets(rootDir) {
    const files = [];

    async function walk(dir) {
        let entries = [];
        try {
            entries = await readdir(dir);
        } catch {
            return;
        }

        entries.sort((a, b) => a.localeCompare(b));
        for (const name of entries) {
            const fullPath = join(dir, name);
            let info;
            try {
                info = await stat(fullPath);
            } catch (error) {
                if (error && typeof error === 'object' && error.code === 'ENOENT') {
                    continue;
                }
                throw error;
            }
            if (info.isDirectory()) {
                await walk(fullPath);
                continue;
            }
            if (fullPath.endsWith('.js') || fullPath.endsWith('.css')) {
                files.push(relative(rootDir, fullPath).replaceAll('\\', '/'));
            }
        }
    }

    await walk(rootDir);
    files.sort((a, b) => a.localeCompare(b));
    return files;
}
