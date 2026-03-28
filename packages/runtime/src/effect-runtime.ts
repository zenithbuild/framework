// @ts-nocheck

import { runWithDependencyCollector } from './reactivity-core.js';
import { registerScopeDisposer, queueWhenScopeReady } from './side-effect-scope.js';
import { drainCleanupStack, applyCleanupResult, createEffectContext } from './effect-utils.js';
import { createScheduler } from './effect-scheduler.js';

let _effectIdCounter = 0;

export function createAutoTrackedEffect(effect, options, scope) {
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
    const runCleanups = [];

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
        const result = effect(createEffectContext(registerCleanup));
        applyCleanupResult(result, registerCleanup);
    }

    const unsubscribers = dependencies.map((dep, index) => {
        if (!dep || typeof dep.subscribe !== 'function') {
            throw new Error(`[Zenith Runtime] zeneffect dependency at index ${index} must expose subscribe(fn)`);
        }

        return dep.subscribe(() => {
            if (scope?.mountReady === true) {
                runEffectNow();
                return;
            }
            queueWhenScopeReady(scope, runEffectNow);
        });
    });

    if (scope?.mountReady === true) {
        runEffectNow();
    } else {
        queueWhenScopeReady(scope, runEffectNow);
    }

    const dispose = () => {
        if (disposed) {
            return;
        }
        disposed = true;
        for (let i = 0; i < unsubscribers.length; i++) {
            unsubscribers[i]();
        }
        drainCleanupStack(runCleanups);
    };

    registerScopeDisposer(scope, dispose);
    return dispose;
}
