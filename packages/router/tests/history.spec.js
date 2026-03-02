// ---------------------------------------------------------------------------
// history.spec.js — History layer tests
// ---------------------------------------------------------------------------

import { push, replace, listen, current } from '../src/history.js';

describe('History Layer', () => {
    test('push updates pathname', () => {
        push('/about');
        expect(window.location.pathname).toBe('/about');
    });

    test('replace updates pathname without new entry', () => {
        push('/first');
        replace('/replaced');
        expect(window.location.pathname).toBe('/replaced');
    });

    test('current returns pathname', () => {
        push('/test-path');
        expect(current()).toBe('/test-path');
    });

    test('listen receives path on popstate', () => {
        const calls = [];
        const unlisten = listen((path) => calls.push(path));

        // Simulate popstate
        push('/page-a');
        push('/page-b');

        // JSDOM doesn't auto-fire popstate on pushState,
        // so we fire it manually
        window.dispatchEvent(new PopStateEvent('popstate'));

        expect(calls.length).toBe(1);
        expect(calls[0]).toBe('/page-b');

        unlisten();
    });

    test('unlisten removes callback', () => {
        const calls = [];
        const unlisten = listen((path) => calls.push(path));

        unlisten();

        window.dispatchEvent(new PopStateEvent('popstate'));
        expect(calls.length).toBe(0);
    });

    test('multiple listeners fire independently', () => {
        const callsA = [];
        const callsB = [];

        const unlistenA = listen((p) => callsA.push(p));
        const unlistenB = listen((p) => callsB.push(p));

        push('/multi');
        window.dispatchEvent(new PopStateEvent('popstate'));

        expect(callsA.length).toBe(1);
        expect(callsB.length).toBe(1);

        unlistenA();

        window.dispatchEvent(new PopStateEvent('popstate'));
        expect(callsA.length).toBe(1); // no more
        expect(callsB.length).toBe(2);

        unlistenB();
    });
});
