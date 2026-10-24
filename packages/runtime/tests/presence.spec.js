import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cleanup } from '../dist/cleanup.js';
import { activateSideEffectScope, createSideEffectScope, zenMount } from '../dist/zeneffect.js';
import { presence, zenPresence } from '../dist/index.js';

function wait(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

describe('zenPresence()', () => {
    let node;
    let ref;

    beforeEach(() => {
        node = document.createElement('div');
        document.body.appendChild(node);
        ref = { current: node };
    });

    afterEach(() => {
        cleanup();
        if (node.parentNode) {
            node.parentNode.removeChild(node);
        }
    });

    test('presence is an optional alias of zenPresence', () => {
        expect(presence).toBe(zenPresence);
        const controller = presence(ref, { timeoutMs: 20 });
        expect(typeof controller.mount).toBe('function');
        expect(typeof controller.setPresent).toBe('function');
    });

    test('entry starts only after zenMount has run for the owning scope', () => {
        const presence = zenPresence(ref, { timeoutMs: 50 });
        const scope = createSideEffectScope('presence-test');
        const disposeMountHook = zenMount((ctx) => {
            ctx.cleanup(presence.mount());
        }, scope);

        presence.setPresent(true);

        expect(presence.getPhase()).toBe('hidden');
        expect(node.hasAttribute('data-zen-presence')).toBe(false);

        activateSideEffectScope(scope);

        expect(presence.getPhase()).toBe('entering');
        expect(node.getAttribute('data-zen-presence')).toBe('entering');

        disposeMountHook();
    });

    test('transitionend settles entering -> present deterministically', () => {
        const presence = zenPresence(ref, { timeoutMs: 200 });
        const unmount = presence.mount();

        presence.setPresent(true);
        expect(presence.getPhase()).toBe('entering');

        node.dispatchEvent(new Event('transitionend'));

        expect(presence.getPhase()).toBe('present');
        expect(node.getAttribute('data-zen-presence')).toBe('present');

        unmount();
    });

    test('animationend settles exiting -> hidden deterministically', () => {
        const presence = zenPresence(ref, { timeoutMs: 200 });
        const unmount = presence.mount();

        presence.setPresent(true);
        node.dispatchEvent(new Event('transitionend'));
        expect(presence.getPhase()).toBe('present');

        presence.setPresent(false);
        expect(presence.getPhase()).toBe('exiting');

        node.dispatchEvent(new Event('animationend'));

        expect(presence.getPhase()).toBe('hidden');
        expect(node.getAttribute('data-zen-presence')).toBe('hidden');

        unmount();
    });

    test('timeout fallback settles phases when no end event fires', async () => {
        const presence = zenPresence(ref, { timeoutMs: 10 });
        const unmount = presence.mount();

        presence.setPresent(true);
        expect(presence.getPhase()).toBe('entering');

        await wait(25);

        expect(presence.getPhase()).toBe('present');
        expect(node.getAttribute('data-zen-presence')).toBe('present');

        unmount();
    });

    test('rerun cancels prior listeners and timers before starting the next phase', async () => {
        const observedPhases = [];
        const presence = zenPresence(ref, {
            timeoutMs: 15,
            onPhaseChange(phase) {
                observedPhases.push(phase);
            }
        });
        const unmount = presence.mount();

        presence.setPresent(true);
        expect(presence.getPhase()).toBe('entering');

        await wait(5);
        presence.setPresent(false);
        expect(presence.getPhase()).toBe('exiting');

        await wait(25);

        expect(observedPhases).toEqual(['entering', 'exiting', 'hidden']);
        expect(presence.getPhase()).toBe('hidden');
        expect(node.getAttribute('data-zen-presence')).toBe('hidden');

        unmount();
    });

    test('cleanup clears pending listeners and timers with no ghost work after unmount', async () => {
        const observedPhases = [];
        const presence = zenPresence(ref, {
            timeoutMs: 10,
            onPhaseChange(phase) {
                observedPhases.push(phase);
            }
        });
        const unmount = presence.mount();

        presence.setPresent(true);
        expect(presence.getPhase()).toBe('entering');

        unmount();
        node.dispatchEvent(new Event('transitionend'));

        await wait(25);

        expect(observedPhases).toEqual(['entering']);
        expect(presence.getPhase()).toBe('hidden');
        expect(node.hasAttribute('data-zen-presence')).toBe(false);
    });
});
