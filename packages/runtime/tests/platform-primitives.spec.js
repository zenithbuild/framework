import { zenWindow, zenDocument, zenOn, zenResize, collectRefs } from '../src/index.js';

describe('platform primitives', () => {
    describe('zenWindow', () => {
        test('returns window in jsdom', () => {
            expect(zenWindow()).toBe(globalThis.window);
        });
    });

    describe('zenDocument', () => {
        test('returns document in jsdom', () => {
            expect(zenDocument()).toBe(globalThis.document);
        });
    });

    describe('zenOn', () => {
        test('subscribes and disposer removes listener', () => {
            const el = document.createElement('div');
            let count = 0;
            const handler = () => { count += 1; };
            const dispose = zenOn(el, 'click', handler);
            el.dispatchEvent(new MouseEvent('click'));
            expect(count).toBe(1);
            dispose();
            el.dispatchEvent(new MouseEvent('click'));
            expect(count).toBe(1);
        });

        test('returns no-op when target is null', () => {
            const dispose = zenOn(null, 'click', () => {});
            expect(typeof dispose).toBe('function');
            dispose();
        });
    });

    describe('zenResize', () => {
        test('calls handler and disposer stops updates', () => {
            let calls = 0;
            const handler = () => { calls += 1; };
            const dispose = zenResize(handler);
            return new Promise((resolve) => {
                requestAnimationFrame(() => {
                    expect(calls).toBeGreaterThanOrEqual(1);
                    const before = calls;
                    window.dispatchEvent(new Event('resize'));
                    requestAnimationFrame(() => {
                        expect(calls).toBeGreaterThanOrEqual(before);
                        dispose();
                        const after = calls;
                        window.dispatchEvent(new Event('resize'));
                        requestAnimationFrame(() => {
                            expect(calls).toBe(after);
                            resolve();
                        });
                    });
                });
            });
        });
    });

    describe('collectRefs', () => {
        test('returns deterministic order and filters nulls', () => {
            const a = { current: document.createElement('a') };
            const b = { current: null };
            const c = { current: document.createElement('span') };
            const nodes = collectRefs(a, b, c);
            expect(nodes).toHaveLength(2);
            expect(nodes[0]).toBe(a.current);
            expect(nodes[1]).toBe(c.current);
        });

        test('filters non-ref objects', () => {
            const out = collectRefs({ current: 123 }, { current: 'x' });
            expect(out).toHaveLength(0);
        });
    });
});
