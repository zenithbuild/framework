// ---------------------------------------------------------------------------
// signal.ts — Zenith Runtime V0
// ---------------------------------------------------------------------------
// Minimal explicit signal primitive.
//
// API:
//   const count = signal(0);
//   count.get();
//   count.set(1);
//   const unsubscribe = count.subscribe((value) => { ... });
//
// Constraints:
//   - No proxy
//   - No implicit dependency tracking
//   - No scheduler
//   - No async queue
// ---------------------------------------------------------------------------

import { _nextReactiveId, _trackDependency } from './zeneffect.js';

export type ZenithSignal<T> = {
    __zenith_id: number;
    get(): T;
    set(nextValue: T): T;
    subscribe(fn: (value: T) => void): () => void;
};

export function signal<T>(initialValue: T): ZenithSignal<T> {
    let value = initialValue;
    const subscribers = new Set<(value: T) => void>();
    const reactiveId = _nextReactiveId();

    return {
        __zenith_id: reactiveId,
        get() {
            _trackDependency(this);
            return value;
        },
        set(nextValue) {
            if (Object.is(value, nextValue)) {
                return value;
            }

            value = nextValue;

            const snapshot = [...subscribers];
            for (let index = 0; index < snapshot.length; index += 1) {
                snapshot[index](value);
            }

            return value;
        },
        subscribe(fn) {
            if (typeof fn !== 'function') {
                throw new Error('[Zenith Runtime] signal.subscribe(fn) requires a function');
            }

            subscribers.add(fn);
            return function unsubscribe() {
                subscribers.delete(fn);
            };
        }
    };
}
