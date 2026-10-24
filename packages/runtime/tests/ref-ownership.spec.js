import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { hydrate } from '../dist/hydrate.js';
import { cleanup } from '../dist/cleanup.js';
import { zenMount, createSideEffectScope, activateSideEffectScope, disposeSideEffectScope } from '../dist/zeneffect.js';

async function flushEffects() {
    await Promise.resolve();
}

describe('ref lifecycle locks', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        cleanup();
        document.body.removeChild(container);
    });

    test('1,2. ref.current populated after hydrate(), cleared after cleanup()', () => {
        container.innerHTML = '<div data-zx-ref="0"></div>';
        
        const myRef = { current: null };

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [],
            markers: [],
            events: [],
            refs: [{ index: 0, state_index: 0, selector: '[data-zx-ref="0"]' }],
            state_values: [myRef],
            signals: []
        });

        // 1. Populated
        expect(myRef.current).toBe(container.querySelector('div'));

        // 2. Cleared
        cleanup();
        expect(myRef.current).toBeNull();
    });

    test('3. Repeated cleanup() is safe', () => {
        container.innerHTML = '<div data-zx-ref="0"></div>';
        
        const myRef = { current: null };

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [],
            markers: [],
            events: [],
            refs: [{ index: 0, state_index: 0, selector: '[data-zx-ref="0"]' }],
            state_values: [myRef],
            signals: []
        });

        cleanup();
        expect(myRef.current).toBeNull();
        
        // Repeated
        cleanup();
        expect(myRef.current).toBeNull();
    });

    test('4. Multiple refs all cleared on single cleanup', () => {
        container.innerHTML = '<div data-zx-ref="0"></div><span data-zx-ref="1"></span>';
        
        const refA = { current: null };
        const refB = { current: null };

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [],
            markers: [],
            events: [],
            refs: [
                { index: 0, state_index: 0, selector: '[data-zx-ref="0"]' },
                { index: 1, state_index: 1, selector: '[data-zx-ref="1"]' }
            ],
            state_values: [refA, refB],
            signals: []
        });

        expect(refA.current.tagName).toBe('DIV');
        expect(refB.current.tagName).toBe('SPAN');

        cleanup();

        expect(refA.current).toBeNull();
        expect(refB.current).toBeNull();
    });

    test('5. ref.current is set before component bootstrap (zenMount callbacks)', async () => {
        // Since we don't have full compiler output here, we simulate a component hydrate call
        container.innerHTML = '<div data-zx-ref="0"><div class="comp"></div></div>';
        
        const myRef = { current: null };
        let nodeAtMount = undefined;

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [],
            markers: [],
            events: [],
            refs: [{ index: 0, state_index: 0, selector: '[data-zx-ref="0"]' }],
            state_values: [myRef],
            signals: [],
            components: [{
                instance: 'test-comp',
                selector: '.comp',
                create: (host, props, ctx) => {
                    // Inside the component bootstrap, we immediately use zenMount
                    ctx.zenMount(() => {
                        // ref should already be populated when mount runs
                        nodeAtMount = myRef.current;
                    });
                    return { mount() {} };
                }
            }]
        });

        await flushEffects();

        expect(myRef.current).not.toBeNull();
        expect(myRef.current.tagName).toBe('DIV');
        expect(nodeAtMount).toBe(myRef.current);
    });
});
