import { signal } from '../dist/signal.js';
import { state } from '../dist/state.js';
import { zeneffect } from '../dist/zeneffect.js';

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

    test('subscriber mutations are snapshot-isolated during notification', () => {
        const count = signal(0);
        const calls = [];
        let unsubscribeSecond = () => {};
        const unsubscribeFirst = count.subscribe((value) => {
            calls.push(`first:${value}`);
            unsubscribeSecond();
        });
        unsubscribeSecond = count.subscribe((value) => calls.push(`second:${value}`));

        count.set(1);
        count.set(2);
        unsubscribeFirst();
        count.set(3);

        expect(calls).toEqual(['first:1', 'second:1', 'first:2']);
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

    test('merges patch objects and replaces with functional updater results', () => {
        const store = state({ count: 1, label: 'one' });
        const calls = [];
        store.subscribe((value) => calls.push(value));

        store.set({ label: 'two' });
        store.set((prev) => ({ count: prev.count + 1 }));

        expect(calls).toEqual([
            { count: 1, label: 'two' },
            { count: 2 }
        ]);
        expect(store.get()).toEqual({ count: 2 });
    });

    test.each([
        ['array patch', []],
        ['null patch', null],
        ['function returning array', () => []],
        ['function returning null', () => null]
    ])('rejects invalid %s', (_label, patch) => {
        const store = state({ ok: true });
        expect(() => store.set(patch)).toThrow('[Zenith Runtime] state.set(next) must resolve to a plain object');
        expect(store.get()).toEqual({ ok: true });
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
