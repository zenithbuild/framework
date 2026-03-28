import { hydrate } from '../dist/hydrate.js';
import { cleanup, _getCounts } from '../dist/cleanup.js';
import { signal } from '../dist/signal.js';
import {
    activateSideEffectScope,
    createSideEffectScope,
    disposeSideEffectScope,
    zenMount,
    zeneffect
} from '../dist/zeneffect.js';

async function flushEffects() {
    await Promise.resolve();
}

describe('cleanup()', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        cleanup();
        document.body.removeChild(container);
    });

    test('removes active event listeners deterministically', () => {
        let clicks = 0;
        container.innerHTML = '<button data-zx-on-click="0">+</button>';

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [{ marker_index: 0, state_index: 0 }],
            markers: [{ index: 0, kind: 'event', selector: '[data-zx-on-click="0"]' }],
            events: [{ index: 0, event: 'click', selector: '[data-zx-on-click="0"]' }],
            state_values: [() => { clicks += 1; }],
            signals: []
        });

        expect(_getCounts().listeners).toBe(1);
        container.querySelector('button').click();
        expect(clicks).toBe(1);

        cleanup();
        expect(_getCounts().listeners).toBe(0);
        container.querySelector('button').click();
        expect(clicks).toBe(1);
    });

    test('is idempotent', () => {
        cleanup();
        cleanup();
        expect(_getCounts().listeners).toBe(0);
    });

    test('fully tears down top-level auto-tracked effects on first cleanup', async () => {
        const count = signal(0);
        const observed = [];

        zeneffect(() => {
            observed.push(count.get());
        });

        await flushEffects();
        cleanup();

        count.set(1);
        await flushEffects();

        expect(observed).toEqual([0]);
    });

    test('cancels queued global effect work during cleanup', async () => {
        const count = signal(0);
        const observed = [];

        zeneffect(() => {
            observed.push(count.get());
        });

        await flushEffects();
        count.set(1);

        cleanup();
        await flushEffects();
        count.set(2);
        await flushEffects();

        expect(observed).toEqual([0]);
    });

    test('repeated cleanup is safe and runs global mount cleanups once', () => {
        const disposed = [];

        zenMount((ctx) => {
            ctx.cleanup(() => disposed.push('disposed'));
        });

        cleanup();
        cleanup();

        expect(disposed).toEqual(['disposed']);
        expect(_getCounts()).toEqual({ effects: 0, listeners: 0 });
    });

    test('cleanup after multiple top-level effects clears all subscriptions', async () => {
        const count = signal(0);
        const label = signal('idle');
        const observedCount = [];
        const observedLabel = [];

        zeneffect(() => {
            observedCount.push(count.get());
        });

        zeneffect([label], () => {
            observedLabel.push(label.get());
        });

        await flushEffects();
        cleanup();

        count.set(1);
        label.set('done');
        await flushEffects();

        expect(observedCount).toEqual([0]);
        expect(observedLabel).toEqual(['idle']);
    });

    test('disposed nested scopes stay disposed across cleanup', async () => {
        const count = signal(0);
        const observed = [];
        const scope = createSideEffectScope('nested');

        zeneffect([count], () => {
            observed.push(count.get());
        }, scope);

        activateSideEffectScope(scope);
        await flushEffects();

        disposeSideEffectScope(scope);
        cleanup();

        count.set(1);
        await flushEffects();

        expect(observed).toEqual([0]);
    });
});
