// ---------------------------------------------------------------------------
// zeneffect.js — Zenith Runtime V0
// ---------------------------------------------------------------------------
// Explicit dependency effect primitive.
//
// API:
//   const dispose = zeneffect([countSignal], () => { ... });
//
// Constraints:
//   - Dependencies are explicit
//   - No implicit tracking context
//   - No scheduler
//   - No async queue
// ---------------------------------------------------------------------------

const DEFAULT_EFFECT_OPTIONS = {
    debounceMs: 0,
    throttleMs: 0,
    raf: false,
    flush: 'post'
};

let _activeDependencyCollector = null;
let _reactiveIdCounter = 0;
let _scopeIdCounter = 0;
let _effectIdCounter = 0;

export function _nextReactiveId() {
    _reactiveIdCounter += 1;
    return _reactiveIdCounter;
}

export function _trackDependency(source) {
    if (typeof _activeDependencyCollector === 'function') {
        _activeDependencyCollector(source);
    }
}

function createInternalScope(label, mountReady) {
    _scopeIdCounter += 1;
    return {
        __zenith_scope: true,
        id: _scopeIdCounter,
        label,
        mountReady: mountReady === true,
        disposed: false,
        pendingMounts: [],
        disposers: []
    };
}

let _globalScope = createInternalScope('global', true);

function isScope(value) {
    return !!value && typeof value === 'object' && value.__zenith_scope === true;
}

function resolveScope(scopeOverride) {
    if (isScope(scopeOverride)) {
        return scopeOverride;
    }
    return _globalScope;
}

export function resetGlobalSideEffects() {
    disposeSideEffectScope(_globalScope);
    _globalScope = createInternalScope('global', true);
}

export function createSideEffectScope(label = 'anonymous') {
    return createInternalScope(label, false);
}

export function activateSideEffectScope(scope) {
    if (!isScope(scope) || scope.disposed || scope.mountReady) {
        return;
    }
    scope.mountReady = true;

    const pending = scope.pendingMounts.slice();
    scope.pendingMounts.length = 0;

    for (let i = 0; i < pending.length; i++) {
        const callback = pending[i];
        if (typeof callback !== 'function') continue;
        try {
            callback();
        } catch {
            // failed effect mounts should not crash sibling nodes
        }
    }
}

function registerScopeDisposer(scope, disposer) {
    if (typeof disposer !== 'function') {
        return () => { };
    }

    if (!scope || scope.disposed) {
        disposer();
        return () => { };
    }

    scope.disposers.push(disposer);

    return function unregisterScopeDisposer() {
        if (!scope || scope.disposed) {
            return;
        }
        const index = scope.disposers.indexOf(disposer);
        if (index >= 0) {
            scope.disposers.splice(index, 1);
        }
    };
}

export function disposeSideEffectScope(scope) {
    if (!scope || scope.disposed) {
        return;
    }

    scope.disposed = true;

    const disposers = scope.disposers.slice();
    scope.disposers.length = 0;
    scope.pendingMounts.length = 0;

    for (let i = disposers.length - 1; i >= 0; i--) {
        const disposer = disposers[i];
        if (typeof disposer !== 'function') {
            continue;
        }
        try {
            disposer();
        } catch {
            // cleanup failures must never break teardown flow
        }
    }
}

function normalizeDelay(value, fieldName) {
    if (value === undefined || value === null) {
        return 0;
    }
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(
            `[Zenith Runtime] zenEffect options.${fieldName} must be a non-negative number`
        );
    }
    return Math.floor(value);
}

function normalizeEffectOptions(options) {
    if (options === undefined || options === null) {
        return DEFAULT_EFFECT_OPTIONS;
    }

    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw new Error('[Zenith Runtime] zenEffect(effect, options) requires options object when provided');
    }

    const normalized = {
        debounceMs: normalizeDelay(options.debounceMs, 'debounceMs'),
        throttleMs: normalizeDelay(options.throttleMs, 'throttleMs'),
        raf: options.raf === true,
        flush: options.flush === 'sync' ? 'sync' : 'post'
    };

    if (options.flush !== undefined && options.flush !== 'sync' && options.flush !== 'post') {
        throw new Error('[Zenith Runtime] zenEffect options.flush must be "post" or "sync"');
    }

    const schedulingModes =
        (normalized.debounceMs > 0 ? 1 : 0) +
        (normalized.throttleMs > 0 ? 1 : 0) +
        (normalized.raf ? 1 : 0);

    if (schedulingModes > 1) {
        throw new Error('[Zenith Runtime] zenEffect options may use only one scheduler: debounceMs, throttleMs, or raf');
    }

    return normalized;
}

function drainCleanupStack(cleanups) {
    for (let i = cleanups.length - 1; i >= 0; i--) {
        const cleanup = cleanups[i];
        if (typeof cleanup !== 'function') {
            continue;
        }
        try {
            cleanup();
        } catch {
            // swallow cleanup errors to preserve deterministic teardown
        }
    }
    cleanups.length = 0;
}

function applyCleanupResult(result, registerCleanup) {
    if (typeof result === 'function') {
        registerCleanup(result);
        return;
    }

    if (result && typeof result === 'object' && typeof result.cleanup === 'function') {
        registerCleanup(result.cleanup);
    }
}

function requireFunction(callback, label) {
    if (typeof callback !== 'function') {
        throw new Error(`[Zenith Runtime] ${label} requires callback function`);
    }
}

function createMountContext(registerCleanup) {
    return {
        cleanup: registerCleanup
    };
}

function createEffectContext(registerCleanup) {
    return {
        cleanup: registerCleanup,
        timeout(callback, delayMs = 0) {
            requireFunction(callback, 'zenEffect context.timeout(callback, delayMs)');
            const timeoutId = setTimeout(callback, normalizeDelay(delayMs, 'timeout'));
            registerCleanup(() => clearTimeout(timeoutId));
            return timeoutId;
        },
        raf(callback) {
            requireFunction(callback, 'zenEffect context.raf(callback)');
            if (typeof requestAnimationFrame === 'function') {
                const frameId = requestAnimationFrame(callback);
                registerCleanup(() => cancelAnimationFrame(frameId));
                return frameId;
            }
            const timeoutId = setTimeout(callback, 16);
            registerCleanup(() => clearTimeout(timeoutId));
            return timeoutId;
        },
        debounce(callback, delayMs) {
            requireFunction(callback, 'zenEffect context.debounce(callback, delayMs)');
            const waitMs = normalizeDelay(delayMs, 'debounce');
            let timeoutId = null;

            const wrapped = (...args) => {
                if (timeoutId !== null) {
                    clearTimeout(timeoutId);
                }
                timeoutId = setTimeout(() => {
                    timeoutId = null;
                    callback(...args);
                }, waitMs);
            };

            registerCleanup(() => {
                if (timeoutId !== null) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
            });

            return wrapped;
        },
        throttle(callback, delayMs) {
            requireFunction(callback, 'zenEffect context.throttle(callback, delayMs)');
            const waitMs = normalizeDelay(delayMs, 'throttle');
            let timeoutId = null;
            let lastRun = 0;
            let pendingArgs = null;

            const invoke = (args) => {
                lastRun = Date.now();
                callback(...args);
            };

            const wrapped = (...args) => {
                const now = Date.now();
                const elapsed = now - lastRun;
                if (lastRun === 0 || elapsed >= waitMs) {
                    if (timeoutId !== null) {
                        clearTimeout(timeoutId);
                        timeoutId = null;
                    }
                    pendingArgs = null;
                    invoke(args);
                    return;
                }

                pendingArgs = args;
                if (timeoutId !== null) {
                    return;
                }

                timeoutId = setTimeout(() => {
                    timeoutId = null;
                    if (pendingArgs) {
                        const next = pendingArgs;
                        pendingArgs = null;
                        invoke(next);
                    }
                }, waitMs - elapsed);
            };

            registerCleanup(() => {
                if (timeoutId !== null) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
                pendingArgs = null;
            });

            return wrapped;
        }
    };
}

function createScheduler(runNow, options) {
    let microtaskQueued = false;
    let debounceTimer = null;
    let throttleTimer = null;
    let rafHandle = null;
    let lastRunAt = 0;

    function clearScheduledWork() {
        if (debounceTimer !== null) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }
        if (throttleTimer !== null) {
            clearTimeout(throttleTimer);
            throttleTimer = null;
        }
        if (rafHandle !== null) {
            if (typeof cancelAnimationFrame === 'function') {
                cancelAnimationFrame(rafHandle);
            } else {
                clearTimeout(rafHandle);
            }
            rafHandle = null;
        }
        microtaskQueued = false;
    }

    function invokeNow() {
        microtaskQueued = false;
        debounceTimer = null;
        throttleTimer = null;
        rafHandle = null;
        lastRunAt = Date.now();
        runNow();
    }

    function schedule() {
        if (options.debounceMs > 0) {
            if (debounceTimer !== null) {
                clearTimeout(debounceTimer);
            }
            debounceTimer = setTimeout(invokeNow, options.debounceMs);
            return;
        }

        if (options.throttleMs > 0) {
            const now = Date.now();
            const elapsed = now - lastRunAt;
            if (lastRunAt === 0 || elapsed >= options.throttleMs) {
                invokeNow();
                return;
            }

            if (throttleTimer !== null) {
                return;
            }

            throttleTimer = setTimeout(invokeNow, options.throttleMs - elapsed);
            return;
        }

        if (options.raf) {
            if (rafHandle !== null) {
                if (typeof cancelAnimationFrame === 'function') {
                    cancelAnimationFrame(rafHandle);
                } else {
                    clearTimeout(rafHandle);
                }
            }

            if (typeof requestAnimationFrame === 'function') {
                rafHandle = requestAnimationFrame(invokeNow);
            } else {
                rafHandle = setTimeout(invokeNow, 16);
            }
            return;
        }

        if (options.flush === 'sync') {
            invokeNow();
            return;
        }

        if (microtaskQueued) {
            return;
        }
        microtaskQueued = true;
        queueMicrotask(invokeNow);
    }

    return {
        schedule,
        cancel: clearScheduledWork
    };
}

function queueWhenScopeReady(scope, callback) {
    if (!scope || scope.disposed) {
        return;
    }
    if (scope.mountReady) {
        callback();
        return;
    }
    scope.pendingMounts.push(callback);
}

function createAutoTrackedEffect(effect, options, scope) {
    let disposed = false;
    const activeSubscriptions = new Map();
    const runCleanups = [];

    _effectIdCounter += 1;
    const effectId = _effectIdCounter;

    function registerCleanup(cleanup) {
        if (typeof cleanup !== 'function') {
            throw new Error('[Zenith Runtime] cleanup(fn) requires a function');
        }
        runCleanups.push(cleanup);
    }

    function runEffectNow() {
        if (disposed || !scope || scope.disposed) {
            return;
        }

        drainCleanupStack(runCleanups);

        const nextDependenciesById = new Map();
        const previousCollector = _activeDependencyCollector;

        _activeDependencyCollector = (source) => {
            if (!source || typeof source.subscribe !== 'function') {
                return;
            }
            const reactiveId = Number.isInteger(source.__zenith_id) ? source.__zenith_id : 0;
            if (!nextDependenciesById.has(reactiveId)) {
                nextDependenciesById.set(reactiveId, source);
            }
        };

        try {
            const result = effect(createEffectContext(registerCleanup));
            applyCleanupResult(result, registerCleanup);
        } finally {
            _activeDependencyCollector = previousCollector;
        }

        const nextDependencies = Array.from(nextDependenciesById.values()).sort((left, right) => {
            const leftId = Number.isInteger(left.__zenith_id) ? left.__zenith_id : 0;
            const rightId = Number.isInteger(right.__zenith_id) ? right.__zenith_id : 0;
            return leftId - rightId;
        });

        const nextSet = new Set(nextDependencies);

        for (const [dependency, unsubscribe] of activeSubscriptions.entries()) {
            if (nextSet.has(dependency)) {
                continue;
            }
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
            activeSubscriptions.delete(dependency);
        }

        for (let i = 0; i < nextDependencies.length; i++) {
            const dependency = nextDependencies[i];
            if (activeSubscriptions.has(dependency)) {
                continue;
            }

            const unsubscribe = dependency.subscribe(() => {
                scheduler.schedule();
            });

            activeSubscriptions.set(
                dependency,
                typeof unsubscribe === 'function' ? unsubscribe : () => { }
            );
        }

        void effectId;
    }

    const scheduler = createScheduler(runEffectNow, options);

    function disposeEffect() {
        if (disposed) {
            return;
        }
        disposed = true;

        scheduler.cancel();

        for (const unsubscribe of activeSubscriptions.values()) {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        }
        activeSubscriptions.clear();

        drainCleanupStack(runCleanups);
    }

    registerScopeDisposer(scope, disposeEffect);
    queueWhenScopeReady(scope, () => scheduler.schedule());

    return disposeEffect;
}

function createExplicitDependencyEffect(effect, dependencies, scope) {
    if (!Array.isArray(dependencies)) {
        throw new Error('[Zenith Runtime] zeneffect(deps, fn) requires an array of dependencies');
    }

    if (dependencies.length === 0) {
        throw new Error('[Zenith Runtime] zeneffect(deps, fn) requires at least one dependency');
    }

    if (typeof effect !== 'function') {
        throw new Error('[Zenith Runtime] zeneffect(deps, fn) requires a function');
    }

    const unsubscribers = dependencies.map((dep, index) => {
        if (!dep || typeof dep.subscribe !== 'function') {
            throw new Error(`[Zenith Runtime] zeneffect dependency at index ${index} must expose subscribe(fn)`);
        }

        return dep.subscribe(() => {
            effect();
        });
    });

    effect();

    return function dispose() {
        for (let i = 0; i < unsubscribers.length; i++) {
            unsubscribers[i]();
        }
    };
}

export function zenEffect(effect, options = null, scopeOverride = null) {
    if (typeof effect !== 'function') {
        throw new Error('[Zenith Runtime] zenEffect(effect) requires a callback function');
    }

    const opts = normalizeEffectOptions(options);
    const scope = resolveScope(scopeOverride);

    return createAutoTrackedEffect(effect, opts, scope);
}

export function zeneffect(effectOrDependencies, optionsOrEffect, scopeOverride = null) {
    if (Array.isArray(effectOrDependencies)) {
        if (typeof optionsOrEffect !== 'function') {
            throw new Error('[Zenith Runtime] zeneffect(deps, effect) requires an effect function');
        }
        return createExplicitDependencyEffect(optionsOrEffect, effectOrDependencies, resolveScope(scopeOverride));
    }

    if (typeof effectOrDependencies === 'function') {
        return createAutoTrackedEffect(
            effectOrDependencies,
            normalizeEffectOptions(optionsOrEffect),
            resolveScope(scopeOverride)
        );
    }

    throw new Error('[Zenith Runtime] zeneffect() invalid arguments. Expected (effect) or (dependencies, effect)');
}

export function zenMount(callback, scopeOverride = null) {
    if (typeof callback !== 'function') {
        throw new Error('[Zenith Runtime] zenMount(callback) requires a function');
    }

    const scope = resolveScope(scopeOverride);
    const cleanups = [];
    let executed = false;
    let registeredDisposer = null;

    function registerCleanup(fn) {
        if (typeof fn !== 'function') {
            throw new Error('[Zenith Runtime] cleanup(fn) requires a function');
        }
        cleanups.push(fn);
    }

    function runMount() {
        if (scope.disposed || executed) {
            return;
        }

        executed = true;

        try {
            const result = callback(createMountContext(registerCleanup));
            applyCleanupResult(result, registerCleanup);
        } catch (error) {
            // Unhandled mount errors shouldn't crash hydration, but we log them
            console.error('[Zenith Runtime] Unhandled error during zenMount:', error);
        }

        registeredDisposer = registerScopeDisposer(scope, () => {
            drainCleanupStack(cleanups);
        });
    }

    queueWhenScopeReady(scope, runMount);

    return function dispose() {
        if (registeredDisposer) {
            registeredDisposer();
        } else {
            drainCleanupStack(cleanups);
        }
    };
}
