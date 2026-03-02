// ---------------------------------------------------------------------------
// signal.js — Zenith Runtime V0
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

/**
 * Create a deterministic signal with explicit subscription semantics.
 *
 * @param {*} initialValue
 * @returns {{ get: () => *, set: (next: *) => *, subscribe: (fn: (value: *) => void) => () => void }}
 */
export function signal(initialValue) {
    let value = initialValue;
    const subscribers = new Set();
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
            for (let i = 0; i < snapshot.length; i++) {
                snapshot[i](value);
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
