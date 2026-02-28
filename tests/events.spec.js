// ---------------------------------------------------------------------------
// events.spec.js — Route change event tests
// ---------------------------------------------------------------------------

import {
    onRouteChange,
    _dispatchRouteChange,
    _clearSubscribers,
    _getSubscriberCount,
    setRouteProtectionPolicy,
    _getRouteProtectionPolicy,
    on,
    off,
    _dispatchRouteEvent
} from '../src/events.js';

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
        // Reset defaults
        setRouteProtectionPolicy({
            onDeny: undefined,
            defaultLoginPath: undefined,
            deny401RedirectToLogin: undefined,
            forbiddenPath: undefined
        });
    });

    test('policy state is initialized and configurable', () => {
        setRouteProtectionPolicy({
            onDeny: 'stay',
            defaultLoginPath: '/login-custom',
            deny401RedirectToLogin: true,
            forbiddenPath: '/forbidden'
        });

        const policy = _getRouteProtectionPolicy();
        expect(policy.onDeny).toBe('stay');
        expect(policy.defaultLoginPath).toBe('/login-custom');
        expect(policy.deny401RedirectToLogin).toBe(true);
        expect(policy.forbiddenPath).toBe('/forbidden');
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
});
