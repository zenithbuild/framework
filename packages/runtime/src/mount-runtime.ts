// @ts-nocheck

import { registerScopeDisposer, queueWhenScopeReady } from './side-effect-scope.js';
import { drainCleanupStack, applyCleanupResult, createMountContext } from './effect-utils.js';

export function createMountEffect(callback, scope) {
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
