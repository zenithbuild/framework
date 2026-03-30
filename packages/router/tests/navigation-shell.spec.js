import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    zenNavigationShell
} from '../dist/index.js';
import {
    _clearRouteEventListeners,
    _dispatchRouteEvent,
    _dispatchRouteEventAsync
} from '../dist/events.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

function createNavigationPayload(navigationId, stage = 'before-leave', navigationType = 'push') {
    return {
        navigationId,
        navigationType,
        to: new URL(`https://example.com/route-${navigationId}`),
        from: new URL('https://example.com/current'),
        routeId: `/route-${navigationId}`,
        params: {},
        stage
    };
}

function activeEventNames() {
    const listeners = globalThis.__zenith_route_event_listeners || {};
    return Object.keys(listeners)
        .filter((eventName) => listeners[eventName] instanceof Set && listeners[eventName].size > 0)
        .sort();
}

function wait(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

describe('zenNavigationShell()', () => {
    let node;
    let ref;

    beforeEach(() => {
        _clearRouteEventListeners();
        document.body.innerHTML = '';
        node = document.createElement('section');
        document.body.appendChild(node);
        ref = { current: node };
    });

    afterEach(() => {
        _clearRouteEventListeners();
        document.body.innerHTML = '';
    });

    test('subscribes only to existing visual lifecycle hooks', () => {
        const shell = zenNavigationShell(ref);
        const stopShell = shell.mount();

        expect(activeEventNames()).toEqual([
            'navigation:abort',
            'navigation:before-enter',
            'navigation:before-leave',
            'navigation:before-swap',
            'navigation:error'
        ]);

        stopShell();
    });

    test('phase transitions are deterministic and ordered', async () => {
        const phases = [];
        const shell = zenNavigationShell(ref, {
            timeoutMs: 200,
            onStateChange(state) {
                phases.push(state.phase);
            }
        });
        const stopShell = shell.mount();

        const leavePromise = _dispatchRouteEventAsync('navigation:before-leave', createNavigationPayload(11, 'before-leave'));
        expect(shell.getState()).toEqual({
            phase: 'leaving',
            navigationId: 11,
            navigationType: 'push'
        });
        node.dispatchEvent(new Event('transitionend'));
        await leavePromise;

        const swapPromise = _dispatchRouteEventAsync('navigation:before-swap', createNavigationPayload(11, 'before-swap'));
        expect(shell.getState()).toEqual({
            phase: 'swapping',
            navigationId: 11,
            navigationType: 'push'
        });
        node.dispatchEvent(new Event('animationend'));
        await swapPromise;

        const enterPromise = _dispatchRouteEventAsync('navigation:before-enter', createNavigationPayload(11, 'before-enter'));
        expect(shell.getState()).toEqual({
            phase: 'entering',
            navigationId: 11,
            navigationType: 'push'
        });
        node.dispatchEvent(new Event('transitionend'));
        await enterPromise;

        expect(shell.getState()).toEqual({
            phase: 'idle',
            navigationId: null,
            navigationType: null
        });
        expect(phases).toEqual(['leaving', 'swapping', 'entering', 'idle']);

        stopShell();
    });

    test('abort resets shell state cleanly', async () => {
        const shell = zenNavigationShell(ref, { timeoutMs: 40 });
        const stopShell = shell.mount();

        const leavePromise = _dispatchRouteEventAsync('navigation:before-leave', createNavigationPayload(21, 'before-leave'));
        expect(shell.getPhase()).toBe('leaving');

        _dispatchRouteEvent('navigation:abort', {
            ...createNavigationPayload(21, 'before-leave'),
            reason: 'superseded'
        });
        await leavePromise;

        expect(shell.getState()).toEqual({
            phase: 'idle',
            navigationId: null,
            navigationType: null
        });
        expect(node.getAttribute('data-zen-navigation-phase')).toBe('idle');
        expect(node.hasAttribute('data-zen-navigation-id')).toBe(false);
        expect(node.hasAttribute('data-zen-navigation-type')).toBe(false);

        stopShell();
    });

    test('error resets shell state cleanly', async () => {
        const shell = zenNavigationShell(ref, { timeoutMs: 40 });
        const stopShell = shell.mount();

        const swapPromise = _dispatchRouteEventAsync('navigation:before-swap', createNavigationPayload(22, 'before-swap'));
        expect(shell.getPhase()).toBe('swapping');

        _dispatchRouteEvent('navigation:error', {
            ...createNavigationPayload(22, 'before-swap'),
            reason: 'runtime-failure',
            error: new Error('boom')
        });
        await swapPromise;

        expect(shell.getState()).toEqual({
            phase: 'idle',
            navigationId: null,
            navigationType: null
        });
        expect(node.getAttribute('data-zen-navigation-phase')).toBe('idle');

        stopShell();
    });

    test('cleanup unsubscribes all listeners', () => {
        const shell = zenNavigationShell(ref);
        const stopShell = shell.mount();

        expect(activeEventNames()).toEqual([
            'navigation:abort',
            'navigation:before-enter',
            'navigation:before-leave',
            'navigation:before-swap',
            'navigation:error'
        ]);

        stopShell();

        expect(activeEventNames()).toEqual([]);
        expect(node.hasAttribute('data-zen-navigation-phase')).toBe(false);

        _dispatchRouteEvent('navigation:before-leave', createNavigationPayload(31, 'before-leave'));
        expect(shell.getState()).toEqual({
            phase: 'idle',
            navigationId: null,
            navigationType: null
        });
    });

    test('stale late completions are ignored after supersession', async () => {
        const shell = zenNavigationShell(ref, { timeoutMs: 25 });
        const stopShell = shell.mount();

        const firstLeave = _dispatchRouteEventAsync('navigation:before-leave', createNavigationPayload(41, 'before-leave'));
        expect(shell.getState().navigationId).toBe(41);

        const secondLeave = _dispatchRouteEventAsync('navigation:before-leave', createNavigationPayload(42, 'before-leave'));
        expect(shell.getState()).toEqual({
            phase: 'leaving',
            navigationId: 42,
            navigationType: 'push'
        });

        _dispatchRouteEvent('navigation:abort', {
            ...createNavigationPayload(41, 'before-leave'),
            reason: 'superseded'
        });
        expect(shell.getState()).toEqual({
            phase: 'leaving',
            navigationId: 42,
            navigationType: 'push'
        });

        node.dispatchEvent(new Event('transitionend'));
        await secondLeave;
        await firstLeave;
        await wait(35);

        expect(shell.getState()).toEqual({
            phase: 'leaving',
            navigationId: 42,
            navigationType: 'push'
        });

        stopShell();
    });

    test('does not alter route truth or navigation resolution surfaces', () => {
        const phases = [];
        const shell = zenNavigationShell(ref, {
            onStateChange(state) {
                phases.push(state.phase);
            }
        });
        const stopShell = shell.mount();

        _dispatchRouteEvent('navigation:request', createNavigationPayload(51, 'request'));
        _dispatchRouteEvent('navigation:data-ready', createNavigationPayload(51, 'data-ready'));
        _dispatchRouteEvent('navigation:content-swapped', createNavigationPayload(51, 'content-swapped'));
        _dispatchRouteEvent('route:redirect', { result: { kind: 'redirect', status: 302 } });
        _dispatchRouteEvent('route:deny', { result: { kind: 'deny', status: 403 } });

        expect(phases).toEqual([]);
        expect(shell.getState()).toEqual({
            phase: 'idle',
            navigationId: null,
            navigationType: null
        });

        stopShell();
    });

    test('docs keep zenNavigationShell scoped as a visual shell, not a route animation framework', () => {
        const guide = fs.readFileSync(path.join(repoRoot, 'docs/documentation/routing/navigation-shell.md'), 'utf8');
        const tracker = fs.readFileSync(path.join(repoRoot, 'docs/phase-3-feature-expansion-tracker.md'), 'utf8');

        expect(guide).toContain('zenNavigationShell');
        expect(guide).toContain('not a route animation framework');
        expect(guide).toContain('zenPresence');
        expect(guide).toContain('navigation:abort');
        expect(guide).toContain('navigation:error');
        expect(tracker).toContain('visual navigation shell');
    });
});
