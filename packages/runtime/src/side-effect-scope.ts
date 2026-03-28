// @ts-nocheck

let _scopeIdCounter = 0;

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

export function isSideEffectScope(value) {
    return !!value && typeof value === 'object' && value.__zenith_scope === true;
}

export function resolveSideEffectScope(scopeOverride) {
    if (isSideEffectScope(scopeOverride)) {
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
    if (!isSideEffectScope(scope) || scope.disposed || scope.mountReady) {
        return;
    }
    scope.mountReady = true;

    const pending = scope.pendingMounts.slice();
    scope.pendingMounts.length = 0;

    for (let i = 0; i < pending.length; i++) {
        const callback = pending[i];
        if (typeof callback !== 'function') {
            continue;
        }
        try {
            callback();
        } catch {
        }
    }
}

export function registerScopeDisposer(scope, disposer) {
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
        }
    }
}

export function queueWhenScopeReady(scope, callback) {
    if (!scope || scope.disposed) {
        return;
    }
    if (scope.mountReady) {
        callback();
        return;
    }
    scope.pendingMounts.push(callback);
}
