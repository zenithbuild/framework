// ---------------------------------------------------------------------------
// state.ts — Zenith Runtime V0
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

type PlainState = Record<string, unknown>;
type StateUpdater<T extends PlainState> = T | ((prev: Readonly<T>) => T);

function isPlainObject(value: unknown): value is PlainState {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    return Object.prototype.toString.call(value) === '[object Object]';
}

function cloneSnapshot<T>(value: T): T {
    if (Array.isArray(value)) {
        return [...value] as T;
    }
    if (isPlainObject(value)) {
        return { ...value } as T;
    }
    return value;
}

export type ZenithState<T extends PlainState> = {
    __zenith_id: number;
    get(): Readonly<T>;
    set(patch: StateUpdater<T>): Readonly<T>;
    subscribe(fn: (next: Readonly<T>) => void): () => void;
};

export function state<T extends PlainState>(initialValue: T): ZenithState<T> {
    let current = Object.freeze(cloneSnapshot(initialValue)) as Readonly<T>;
    const subscribers = new Set<(next: Readonly<T>) => void>();
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

            if (!isPlainObject(nextValue)) {
                throw new Error('[Zenith Runtime] state.set(next) must resolve to a plain object');
            }

            const nextSnapshot = Object.freeze(cloneSnapshot(nextValue)) as Readonly<T>;
            if (Object.is(current, nextSnapshot)) {
                return current;
            }

            current = nextSnapshot;

            const snapshot = [...subscribers];
            for (let index = 0; index < snapshot.length; index += 1) {
                snapshot[index](current);
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
