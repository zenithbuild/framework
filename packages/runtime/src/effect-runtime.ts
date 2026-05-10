// @ts-nocheck

import { runWithDependencyCollector } from './reactivity-core.js';
import { registerScopeDisposer, queueWhenScopeReady } from './side-effect-scope.js';
import { drainCleanupStack, applyCleanupResult, createEffectContext, runCleanupCallback } from './effect-utils.js';
import { createScheduler } from './effect-scheduler.js';

let _effectIdCounter = 0;

export function createAutoTrackedEffect(effect, options, scope) {
    let disposed = false;
    let completedSetup = false;
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

        try {
            runWithDependencyCollector((source) => {
                if (!source || typeof source.subscribe !== 'function') {
                    return;
                }
                const reactiveId = Number.isInteger(source.__zenith_id) ? source.__zenith_id : 0;
                if (!nextDependenciesById.has(reactiveId)) {
                    nextDependenciesById.set(reactiveId, source);
                }
            }, () => {
                const result = effect(createEffectContext(registerCleanup));
                applyCleanupResult(result, registerCleanup);
            });

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

            completedSetup = true;
        } catch (error) {
            if (!completedSetup) {
                disposeEffect();
            }
            throw error;
        }

        void effectId;
    }

    const scheduler = createScheduler(runEffectNow, options);

    function disposeEffect(errors = null) {
        if (disposed) {
            return;
        }
        disposed = true;

        scheduler.cancel();

        for (const unsubscribe of activeSubscriptions.values()) {
            if (typeof unsubscribe === 'function') {
                runCleanupCallback(unsubscribe, errors);
            }
        }
        activeSubscriptions.clear();

        drainCleanupStack(runCleanups, errors);
    }

    registerScopeDisposer(scope, disposeEffect);
    queueWhenScopeReady(scope, () => scheduler.schedule());

    return disposeEffect;
}

export function createExplicitDependencyEffect(effect, dependencies, scope) {
    if (!Array.isArray(dependencies)) {
        throw new Error('[Zenith Runtime] zeneffect(deps, fn) requires an array of dependencies');
    }

    if (dependencies.length === 0) {
        throw new Error('[Zenith Runtime] zeneffect(deps, fn) requires at least one dependency');
    }

    if (typeof effect !== 'function') {
        throw new Error('[Zenith Runtime] zeneffect(deps, fn) requires a function');
    }

    let disposed = false;
    let completedSetup = false;
    const runCleanups = [];
    const unsubscribers = [];

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
        try {
            const result = effect(createEffectContext(registerCleanup));
            applyCleanupResult(result, registerCleanup);
            completedSetup = true;
        } catch (error) {
            if (!completedSetup) {
                dispose();
            }
            throw error;
        }
    }

    function dispose(errors = null) {
        if (disposed) {
            return;
        }
        disposed = true;
        for (let i = unsubscribers.length - 1; i >= 0; i--) {
            if (typeof unsubscribers[i] === 'function') {
                runCleanupCallback(unsubscribers[i], errors);
            }
        }
        unsubscribers.length = 0;
        drainCleanupStack(runCleanups, errors);
    }

    try {
        for (let index = 0; index < dependencies.length; index++) {
            const dep = dependencies[index];
            if (!dep || typeof dep.subscribe !== 'function') {
                throw new Error(`[Zenith Runtime] zeneffect dependency at index ${index} must expose subscribe(fn)`);
            }
        }

        for (let index = 0; index < dependencies.length; index++) {
            const dep = dependencies[index];
            const unsubscribe = dep.subscribe(() => {
                if (scope?.mountReady === true) {
                    runEffectNow();
                    return;
                }
                queueWhenScopeReady(scope, runEffectNow);
            });
            unsubscribers.push(typeof unsubscribe === 'function' ? unsubscribe : () => { });
        }

        if (scope?.mountReady === true) {
            runEffectNow();
        } else {
            queueWhenScopeReady(scope, runEffectNow);
        }

        registerScopeDisposer(scope, dispose);
        return dispose;
    } catch (error) {
        dispose();
        throw error;
    }
}
