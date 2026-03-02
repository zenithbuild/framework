import { signal } from '../src/signal.js';
import { state } from '../src/state.js';
import { zeneffect } from '../src/zeneffect.js';

describe('signal()', () => {
    test('uses explicit get/set API', () => {
        const count = signal(0);
        expect(count.get()).toBe(0);
        count.set(5);
        expect(count.get()).toBe(5);
    });

    test('notifies explicit subscribers only on value change', () => {
        const count = signal(1);
        const calls = [];
        const unsubscribe = count.subscribe((value) => calls.push(value));

        count.set(2);
        count.set(2);
        count.set(3);
        unsubscribe();
        count.set(4);

        expect(calls).toEqual([2, 3]);
    });
});

describe('state()', () => {
    test('returns immutable snapshots', () => {
        const store = state({ a: 1, b: 2 });
        const first = store.get();
        expect(Object.isFrozen(first)).toBe(true);

        const next = store.set({ b: 3 });
        expect(next).toEqual({ a: 1, b: 3 });
        expect(Object.isFrozen(next)).toBe(true);
    });

    test('supports functional updater', () => {
        const store = state({ count: 1 });
        store.set((prev) => ({ ...prev, count: prev.count + 1 }));
        expect(store.get()).toEqual({ count: 2 });
    });
});

describe('zeneffect()', () => {
    test('requires explicit dependencies', () => {
        expect(() => zeneffect([], () => {})).toThrow('[Zenith Runtime]');
    });

    test('runs on dependency updates and disposes cleanly', () => {
        const count = signal(0);
        const observed = [];

        const dispose = zeneffect([count], () => {
            observed.push(count.get());
        });

        count.set(1);
        count.set(2);
        dispose();
        count.set(3);

        expect(observed).toEqual([0, 1, 2]);
    });
});
