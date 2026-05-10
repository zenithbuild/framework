// ---------------------------------------------------------------------------
// events.spec.js — Route change event tests
// ---------------------------------------------------------------------------

import { jest } from '@jest/globals';
import fs from 'node:fs';

import {
    onRouteChange,
    _dispatchRouteChange,
    _clearSubscribers,
    _getSubscriberCount,
    setAdvisoryRoutePolicy,
    _getAdvisoryRoutePolicy,
    setRouteProtectionPolicy,
    _getRouteProtectionPolicy,
    on,
    off,
    _dispatchRouteEvent,
    _dispatchRouteEventAsync,
    _clearRouteEventListeners
} from '../dist/events.js';
import { renderRouterModule } from '../template.js';

function extractTemplateEventNames(source) {
    const match = source.match(/const __ZENITH_ROUTE_EVENT_NAMES = \[([\s\S]*?)\];/);
    if (!match) {
        return [];
    }
    return Array.from(match[1].matchAll(/"([^"]+)"/g), (entry) => entry[1]);
}

function extractRouteEventNamesFromSource(source) {
    const match = source.match(/const ROUTE_EVENT_NAMES = \[([\s\S]*?)\] as const;/);
    if (!match) {
        return [];
    }
    return Array.from(match[1].matchAll(/'([^']+)'/g), (entry) => entry[1]);
}

function extractRouteEventNamesFromTypes(source) {
    const match = source.match(/export type RouteEventName =([\s\S]*?);/);
    if (!match) {
        return [];
    }
    return Array.from(match[1].matchAll(/"([^"]+)"/g), (entry) => entry[1]);
}

function extractTemplateEmittedEventNames(source) {
    const names = new Set();
    for (const match of source.matchAll(/dispatchRouteEvent\(\s*["']([^"']+)["']/g)) {
        names.add(match[1]);
    }
    for (const match of source.matchAll(/emitNavigationEvent\([^,]+,\s*["']([^"']+)["']/g)) {
        names.add(match[1]);
    }
    return Array.from(names).sort();
}

describe('Route Change Events', () => {
    afterEach(() => {
        _clearSubscribers();
    });

    test('subscriber receives route change notification', () => {
        const calls = [];
        onRouteChange((detail) => calls.push(detail));

        _dispatchRouteChange({ path: '/about', matched: true });

        expect(calls.length).toBe(1);
        expect(calls[0].path).toBe('/about');
        expect(calls[0].matched).toBe(true);
    });

    test('subscriber receives params on dynamic match', () => {
        const calls = [];
        onRouteChange((detail) => calls.push(detail));

        _dispatchRouteChange({ path: '/users/42', params: { id: '42' }, matched: true });

        expect(calls[0].params).toEqual({ id: '42' });
    });

    test('subscriber receives unmatched notification', () => {
        const calls = [];
        onRouteChange((detail) => calls.push(detail));

        _dispatchRouteChange({ path: '/nowhere', matched: false });

        expect(calls[0].matched).toBe(false);
    });

    test('unsubscribe removes callback', () => {
        const calls = [];
        const unsub = onRouteChange((detail) => calls.push(detail));

        unsub();

        _dispatchRouteChange({ path: '/test', matched: true });
        expect(calls.length).toBe(0);
    });

    test('multiple subscribers fire independently', () => {
        const callsA = [];
        const callsB = [];

        const unsubA = onRouteChange((d) => callsA.push(d));
        const unsubB = onRouteChange((d) => callsB.push(d));

        _dispatchRouteChange({ path: '/x', matched: true });

        expect(callsA.length).toBe(1);
        expect(callsB.length).toBe(1);

        unsubA();

        _dispatchRouteChange({ path: '/y', matched: true });
        expect(callsA.length).toBe(1);
        expect(callsB.length).toBe(2);

        unsubB();
    });

    test('subscriber count tracks correctly', () => {
        expect(_getSubscriberCount()).toBe(0);

        const unsub1 = onRouteChange(() => { });
        expect(_getSubscriberCount()).toBe(1);

        const unsub2 = onRouteChange(() => { });
        expect(_getSubscriberCount()).toBe(2);

        unsub1();
        expect(_getSubscriberCount()).toBe(1);

        unsub2();
        expect(_getSubscriberCount()).toBe(0);
    });

    test('clearSubscribers removes all', () => {
        onRouteChange(() => { });
        onRouteChange(() => { });
        expect(_getSubscriberCount()).toBe(2);

        _clearSubscribers();
        expect(_getSubscriberCount()).toBe(0);
    });
});

describe('Route Protection Events & Policy', () => {
    afterEach(() => {
        _clearRouteEventListeners();
        // Reset defaults
        setRouteProtectionPolicy({
            onDeny: undefined,
            defaultLoginPath: undefined,
            deny401RedirectToLogin: undefined,
            forbiddenPath: undefined
        });
    });

    test('policy state is initialized and configurable', () => {
        setAdvisoryRoutePolicy({
            onDeny: 'stay',
            defaultLoginPath: '/login-custom',
            deny401RedirectToLogin: true,
            forbiddenPath: '/forbidden'
        });

        const policy = _getAdvisoryRoutePolicy();
        expect(policy.onDeny).toBe('stay');
        expect(policy.defaultLoginPath).toBe('/login-custom');
        expect(policy.deny401RedirectToLogin).toBe(true);
        expect(policy.forbiddenPath).toBe('/forbidden');
    });

    test('legacy route protection policy aliases share advisory policy state', () => {
        setRouteProtectionPolicy({
            defaultLoginPath: '/login-legacy'
        });

        expect(_getAdvisoryRoutePolicy().defaultLoginPath).toBe('/login-legacy');

        setAdvisoryRoutePolicy({
            forbiddenPath: '/blocked'
        });

        const policy = _getRouteProtectionPolicy();
        expect(policy.defaultLoginPath).toBe('/login-legacy');
        expect(policy.forbiddenPath).toBe('/blocked');
    });

    test('policy/event stores are shared on globalThis for template interop', () => {
        setAdvisoryRoutePolicy({
            defaultLoginPath: '/login-global'
        });

        expect(globalThis.__zenith_route_protection_policy.defaultLoginPath).toBe('/login-global');
        expect(globalThis.__zenith_route_event_listeners).toBeDefined();
        expect(globalThis.__zenith_route_event_listeners['route-check:start'] instanceof Set).toBe(true);
        expect(globalThis.__zenith_route_event_listeners['navigation:before-leave'] instanceof Set).toBe(true);
    });

    test('declared route event names match template initialization and emissions', () => {
        const source = renderRouterModule({
            manifestJson: JSON.stringify({ routes: [], chunks: {}, server_routes: [] }),
            runtimeImport: '@zenithbuild/runtime',
            coreImport: '@zenithbuild/core',
            routeCheck: true
        });
        const runtimeSource = fs.readFileSync(new URL('../src/events.ts', import.meta.url), 'utf8');
        const typeSource = fs.readFileSync(new URL('../index.d.ts', import.meta.url), 'utf8');
        const declared = extractRouteEventNamesFromSource(runtimeSource).sort();
        const typed = extractRouteEventNamesFromTypes(typeSource).sort();
        const initialized = extractTemplateEventNames(source).sort();
        const emitted = extractTemplateEmittedEventNames(source);

        expect(typed).toEqual(declared);
        expect(declared).toEqual(initialized);
        for (const eventName of emitted) {
            expect(declared).toContain(eventName);
        }
        expect(declared).not.toContain('guard:start');
        expect(declared).not.toContain('guard:end');
    });

    test('event lifecycle dispatches listeners in order', () => {
        const logs = [];
        const startFn = (payload) => logs.push('start:' + payload.routeId);
        const denyFn = (payload) => logs.push('deny:' + payload.result.status);
        const redirectFn = (payload) => logs.push('redirect:' + payload.result.status);

        on('route-check:start', startFn);
        on('route:deny', denyFn);
        on('route:redirect', redirectFn);

        _dispatchRouteEvent('route-check:start', { routeId: '123' });
        _dispatchRouteEvent('route:deny', { result: { kind: 'deny', status: 401 } });
        _dispatchRouteEvent('route:deny', { result: { kind: 'deny', status: 403 } });
        _dispatchRouteEvent('route:redirect', { result: { kind: 'redirect', status: 302 } });

        expect(logs).toEqual([
            'start:123',
            'deny:401',
            'deny:403',
            'redirect:302'
        ]);

        off('route-check:start', startFn);
        off('route:deny', denyFn);
        off('route:redirect', redirectFn);

        _dispatchRouteEvent('route-check:start', { routeId: '456' });
        expect(logs).toEqual([
            'start:123',
            'deny:401',
            'deny:403',
            'redirect:302'
        ]);
    });

    test('awaited lifecycle handlers run sequentially in registration order', async () => {
        const order = [];
        on('navigation:before-leave', async () => {
            order.push('first:start');
            await Promise.resolve();
            order.push('first:end');
        });
        on('navigation:before-leave', async () => {
            order.push('second:start');
            await Promise.resolve();
            order.push('second:end');
        });

        await _dispatchRouteEventAsync('navigation:before-leave', {
            navigationId: 7,
            navigationType: 'push',
            to: new URL('https://example.com/about'),
            from: new URL('https://example.com/'),
            routeId: '/about',
            params: {},
            stage: 'before-leave'
        });

        expect(order).toEqual([
            'first:start',
            'first:end',
            'second:start',
            'second:end'
        ]);
    });

    test('listener failures emit navigation:error without stopping later listeners', async () => {
        const logs = [];
        const errors = [];
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        try {
            on('navigation:error', (payload) => {
                errors.push(payload);
            });
            on('navigation:before-swap', () => {
                logs.push('first');
                throw new Error('boom');
            });
            on('navigation:before-swap', () => {
                logs.push('second');
            });

            await _dispatchRouteEventAsync('navigation:before-swap', {
                navigationId: 11,
                navigationType: 'push',
                to: new URL('https://example.com/docs'),
                from: new URL('https://example.com/about'),
                routeId: '/docs',
                params: {},
                stage: 'before-swap'
            });

            expect(logs).toEqual(['first', 'second']);
            expect(errors).toHaveLength(1);
            expect(errors[0].reason).toBe('listener-error');
            expect(errors[0].hook).toBe('navigation:before-swap');
            expect(errors[0].routeId).toBe('/docs');
        } finally {
            errorSpy.mockRestore();
        }
    });
});
