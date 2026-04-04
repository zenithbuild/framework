import { existsSync, watch } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { isAbsolute, relative, resolve } from 'node:path';
import { readChangeFingerprint } from '../dev-watch.js';
import { loadRouteSurfaceState } from '../preview.js';

export function createDevWatcher(options) {
    const {
        watchRoots,
        resolvedOutDir,
        resolvedOutDirTmp,
        projectRoot,
        rebuildDebounceMs,
        queuedRebuildDebounceMs,
        buildSession,
        outDir,
        configuredBasePath,
        logger,
        startupProfile,
        state,
        syncCssStateFromBuild,
        broadcastEvent,
        trace
    } = options;

    /** @type {import('fs').FSWatcher[]} */
    let watchers = [];
    let buildDebounce = null;
    let queuedFiles = new Set();
    const lastQueuedFingerprints = new Map();
    let buildInFlight = false;

    function isWithin(parent, child) {
        const rel = relative(parent, child);
        return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
    }

    function toDisplayPath(absPath) {
        const rel = relative(projectRoot, absPath);
        if (rel === '') return '.';
        if (!rel.startsWith('..') && !isAbsolute(rel)) {
            return rel;
        }
        return absPath;
    }

    function shouldIgnoreChange(absPath) {
        if (isWithin(resolvedOutDir, absPath)) {
            return true;
        }
        if (isWithin(resolvedOutDirTmp, absPath)) {
            return true;
        }
        const rel = relative(projectRoot, absPath);
        if (rel.startsWith('..') || isAbsolute(rel)) {
            return false;
        }
        const segments = rel.split(/[\\/]+/g);
        return segments.includes('node_modules')
            || segments.includes('.git')
            || segments.includes('.zenith')
            || segments.includes('target')
            || segments.includes('.turbo');
    }

    const triggerBuildDrain = (delayMs = rebuildDebounceMs) => {
        if (buildDebounce !== null) {
            clearTimeout(buildDebounce);
        }
        buildDebounce = setTimeout(() => {
            buildDebounce = null;
            void drainBuildQueue();
        }, delayMs);
    };

    const drainBuildQueue = async () => {
        if (buildInFlight) {
            return;
        }
        const changedPaths = Array.from(queuedFiles);
        const changed = changedPaths.map(toDisplayPath).sort();
        if (changed.length === 0) {
            return;
        }
        queuedFiles.clear();

        buildInFlight = true;
        const cycleBuildId = state.pendingBuildId + 1;
        state.pendingBuildId = cycleBuildId;
        state.buildStatus = 'building';
        logger.build(`Rebuild (id=${cycleBuildId})`);
        broadcastEvent('build_start', { buildId: cycleBuildId, changedFiles: changed });

        const startTime = Date.now();
        const previousCssAssetPath = state.currentCssAssetPath;
        const previousCssContent = state.currentCssContent;
        const onlyCss = changed.length > 0 && changed.every((filePath) => filePath.endsWith('.css'));
        try {
            const buildResult = await buildSession.build({ changedFiles: changedPaths, logger });
            const cssReady = await syncCssStateFromBuild(buildResult, cycleBuildId);
            if (!onlyCss) {
                state.currentRouteState = await loadRouteSurfaceState(outDir, configuredBasePath);
            }
            const cssChanged = cssReady && (
                state.currentCssAssetPath !== previousCssAssetPath ||
                state.currentCssContent !== previousCssContent
            );
            state.buildId = cycleBuildId;
            state.buildStatus = 'ok';
            state.buildError = null;
            state.lastBuildMs = Date.now();
            state.durationMs = state.lastBuildMs - startTime;
            logger.build(`Complete (id=${cycleBuildId}, ${state.durationMs}ms)`);

            broadcastEvent('build_complete', {
                buildId: cycleBuildId,
                durationMs: state.durationMs,
                status: state.buildStatus,
                cssHref: state.currentCssHref,
                changedFiles: changed
            });
            trace('state_snapshot', {
                status: state.buildStatus,
                buildId: cycleBuildId,
                cssHref: state.currentCssHref,
                durationMs: state.durationMs,
                changedFiles: changed
            });

            if (cssChanged && state.currentCssHref.length > 0) {
                logger.css(`ready (${state.currentCssHref})`);
                logger.hmr(`css_update (buildId=${cycleBuildId})`);
                broadcastEvent('css_update', { href: state.currentCssHref, changedFiles: changed });
            }

            if (!onlyCss) {
                logger.hmr(`reload (buildId=${cycleBuildId})`);
                broadcastEvent('reload', { changedFiles: changed });
            } else {
                trace('css_only_update', {
                    buildId: cycleBuildId,
                    cssHref: state.currentCssHref,
                    cssChanged,
                    changedFiles: changed
                });
            }
        } catch (error) {
            const fullError = error instanceof Error ? error.message : String(error);
            state.buildStatus = 'error';
            state.buildError = {
                message: fullError.length > 10000
                    ? `${fullError.slice(0, 10000)}... (truncated)`
                    : fullError
            };
            state.lastBuildMs = Date.now();
            state.durationMs = state.lastBuildMs - startTime;
            logger.error('rebuild failed', {
                hint: 'fix the error and save again',
                error
            });

            broadcastEvent('build_error', {
                buildId: cycleBuildId,
                ...state.buildError,
                changedFiles: changed
            });
            trace('state_snapshot', {
                status: state.buildStatus,
                buildId: state.buildId,
                cssHref: state.currentCssHref,
                durationMs: state.durationMs,
                error: state.buildError
            });
        } finally {
            buildInFlight = false;
            if (queuedFiles.size > 0) {
                triggerBuildDrain(queuedRebuildDebounceMs);
            }
        }
    };

    function start() {
        const watcherStartedAt = performance.now();
        const roots = Array.from(watchRoots);
        for (const root of roots) {
            if (!existsSync(root)) continue;
            try {
                const watcher = watch(root, { recursive: true }, (_eventType, filename) => {
                    if (!filename) {
                        return;
                    }
                    const changedPath = resolve(root, String(filename));
                    if (shouldIgnoreChange(changedPath)) {
                        return;
                    }
                    void (async () => {
                        const fingerprint = await readChangeFingerprint(changedPath);
                        if (lastQueuedFingerprints.get(changedPath) === fingerprint) {
                            return;
                        }
                        lastQueuedFingerprints.set(changedPath, fingerprint);
                        queuedFiles.add(changedPath);
                        triggerBuildDrain();
                    })();
                });
                watchers.push(watcher);
            } catch {
                // fs.watch recursive may not be supported on this platform/root
            }
        }
        startupProfile.emit('watcher_ready', {
            roots: roots.length,
            activeWatchers: watchers.length,
            durationMs: startupProfile.roundMs(performance.now() - watcherStartedAt)
        });
    }

    function close() {
        if (buildDebounce !== null) {
            clearTimeout(buildDebounce);
            buildDebounce = null;
        }
        for (const watcher of watchers) {
            try {
                watcher.close();
            } catch {
                // ignore close errors
            }
        }
        watchers = [];
        queuedFiles.clear();
        lastQueuedFingerprints.clear();
    }

    function activeWatcherCount() {
        return watchers.length;
    }

    return {
        start,
        close,
        activeWatcherCount
    };
}
