// ---------------------------------------------------------------------------
// state.js — Zenith Runtime V0
// ---------------------------------------------------------------------------
// Proxy-free immutable state helper.
//
// API:
//   const store = state({ count: 0 });
//   store.get();
//   store.set({ count: 1 });
//   store.set((prev) => ({ ...prev, count: prev.count + 1 }));
// ---------------------------------------------------------------------------
import { _nextReactiveId, _trackDependency } from './zeneffect.js';

function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    return Object.prototype.toString.call(value) === '[object Object]';
}

function cloneSnapshot(value) {
    if (Array.isArray(value)) {
        return [...value];
    }
    if (isPlainObject(value)) {
        return { ...value };
    }
    return value;
}

/**
 * Create a proxy-free immutable state container.
 *
 * @param {object} initialValue
 * @returns {{ get: () => object, set: (patch: object | ((prev: object) => object)) => object, subscribe: (fn: (next: object) => void) => () => void }}
 */
export function state(initialValue) {
    let current = Object.freeze(cloneSnapshot(initialValue));
    const subscribers = new Set();
    const reactiveId = _nextReactiveId();

    return {
        __zenith_id: reactiveId,
        get() {
            _trackDependency(this);
            return current;
        },
        set(nextPatch) {
            const nextValue = typeof nextPatch === 'function'
                ? nextPatch(current)
                : { ...current, ...nextPatch };

            if (!nextValue || typeof nextValue !== 'object' || Array.isArray(nextValue)) {
                throw new Error('[Zenith Runtime] state.set(next) must resolve to a plain object');
            }

            const nextSnapshot = Object.freeze(cloneSnapshot(nextValue));
            if (Object.is(current, nextSnapshot)) {
                return current;
            }

            current = nextSnapshot;

            const snapshot = [...subscribers];
            for (let i = 0; i < snapshot.length; i++) {
                snapshot[i](current);
            }

            return current;
        },
        subscribe(fn) {
            if (typeof fn !== 'function') {
                throw new Error('[Zenith Runtime] state.subscribe(fn) requires a function');
            }

            subscribers.add(fn);
            return function unsubscribe() {
                subscribers.delete(fn);
            };
        }
    };
}
