import {
    signal,
    effect,
    mount,
    presence,
    window as zenWindowFn,
    document as zenDocumentFn,
    zenPresence,
    zeneffect,
    zenEffect,
    zenMount
} from '../src/index.js';
import { cleanup } from '../src/cleanup.js';
import { hydrate } from '../src/hydrate.js';

describe('Runtime Contract Truth', () => {
    beforeEach(() => {
        cleanup();
    });

    afterEach(() => {
        cleanup();
    });

    describe('DX Naming Restoration', () => {
        test('canonical public DX names are exported', () => {
            expect(typeof zeneffect).toBe('function');
            expect(typeof zenMount).toBe('function');
            expect(typeof zenPresence).toBe('function');
            expect(typeof zenWindowFn).toBe('function');
            expect(typeof zenDocumentFn).toBe('function');
        });

        test('legacy or standard aliases exist but wrap canonical names', () => {
            expect(typeof effect).toBe('function');
            expect(typeof mount).toBe('function');
            expect(typeof presence).toBe('function');
            expect(presence).toBe(zenPresence);
            expect(typeof zenEffect).toBe('function'); // Legacy camelCase
        });
    });

    describe('Effect Scheduling Semantics', () => {
        test('auto-tracked effect defers execution to a microtask by default', async () => {
            const count = signal(0);
            const invocations = [];

            effect(() => {
                invocations.push(count.get());
            });

            // Initial run is deferred
            expect(invocations).toEqual([]);

            await Promise.resolve();
            expect(invocations).toEqual([0]);

            count.set(1);
            // Update is deferred
            expect(invocations).toEqual([0]);

            // Wait for microtask
            await Promise.resolve();
            expect(invocations).toEqual([0, 1]);
        });

        test('flush: "sync" option executes immediately without deferral', () => {
            const count = signal(0);
            const invocations = [];

            effect(() => {
                invocations.push(count.get());
            }, { flush: 'sync' });

            // initial run is synchronous
            expect(invocations).toEqual([0]);

            count.set(1);
            // subsequent run is synchronous
            expect(invocations).toEqual([0, 1]);
        });

        test('explicit dependency effect executes synchronously if scope is ready', () => {
            const count = signal(0);
            const invocations = [];

            effect([count], () => {
                invocations.push(count.get());
            });

            // initial run is synchronous
            expect(invocations).toEqual([0]);

            count.set(1);
            // subsequent run is synchronous
            expect(invocations).toEqual([0, 1]);
        });
    });

    describe('Cleanup & Disposal Guarantees', () => {
        test('cleanup() is entirely idempotent', () => {
            expect(() => {
                cleanup();
                cleanup();
                cleanup();
            }).not.toThrow();
        });

        test('cleanup() prevents scheduled ghost work', async () => {
            const count = signal(0);
            const invocations = [];

            effect(() => {
                invocations.push(count.get());
            });

            // initial run microtask
            await Promise.resolve();
            expect(invocations).toEqual([0]);
            invocations.length = 0;

            // Trigger an update
            count.set(1);
            
            // Clean up BEFORE the microtask flushes
            cleanup();

            // Wait for microtask
            await Promise.resolve();

            // The scheduled effect must not have run
            expect(invocations).toEqual([]);
        });
    });
    describe('Component Prop Transport Primitive Schema', () => {
        const createPayload = (props) => {
            const root = document.createElement('div');
            root.innerHTML = '<span class="comp"></span>';
            return {
                ir_version: 1,
                root,
                expressions: [],
                markers: [],
                events: [],
                state_values: [signal('test-state')],
                signals: [{ id: 0, kind: 'signal', state_index: 0 }],
                components: [{
                    instance: 'test-comp',
                    selector: '.comp',
                    props,
                    create: () => {}
                }]
            };
        };

        test('static descriptor hydrates correctly', () => {
            const payload = createPayload([{ name: 'label', type: 'static', value: 'hello' }]);
            expect(() => hydrate(payload)).not.toThrow();
        });

        test('signal descriptor hydrates correctly', () => {
            const payload = createPayload([{ name: 'count', type: 'signal', index: 0 }]);
            expect(() => hydrate(payload)).not.toThrow();
        });

        test('unknown descriptor type fails hard', () => {
            const payload = createPayload([{ name: 'foo', type: 'magic', value: 123 }]);
            expect(() => hydrate(payload)).toThrow(/has unsupported type "magic"/);
        });

        test('malformed descriptor (missing name) fails hard', () => {
            const payload = createPayload([{ type: 'static', value: 'bad' }]);
            expect(() => hydrate(payload)).toThrow(/requires a non-empty name/);
        });

        test('malformed descriptor (not an object) fails hard', () => {
            const payload = createPayload(['just-a-string']);
            expect(() => hydrate(payload)).toThrow(/must be an object/);
        });
        
        test('missing index for signal prop fails hard', () => {
            const payload = createPayload([{ name: 'foo', type: 'signal', value: 0 }]); // missing index
            expect(() => hydrate(payload)).toThrow(/requires a valid signal index/);
        });

        test('missing value for static prop fails hard', () => {
            const payload = createPayload([{ name: 'foo', type: 'static' }]); // missing value
            expect(() => hydrate(payload)).toThrow(/requires a value/);
        });
    });
});
