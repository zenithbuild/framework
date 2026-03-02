// ---------------------------------------------------------------------------
// navigate.spec.js — Navigation API tests
// ---------------------------------------------------------------------------

import { navigate, back, forward, getCurrentPath, _setNavigationResolver } from '../src/navigate.js';

describe('Navigation API', () => {
    afterEach(() => {
        _setNavigationResolver(null);
    });

    test('navigate pushes path to history', async () => {
        await navigate('/about');
        expect(window.location.pathname).toBe('/about');
    });

    test('navigate triggers resolver if set', async () => {
        const calls = [];
        _setNavigationResolver(async (path) => calls.push(path));

        await navigate('/test');

        expect(calls).toEqual(['/test']);
    });

    test('navigate works without resolver', async () => {
        // No resolver set — should not throw
        await navigate('/safe');
        expect(window.location.pathname).toBe('/safe');
    });

    test('getCurrentPath returns current pathname', () => {
        history.pushState({}, '', '/check');
        expect(getCurrentPath()).toBe('/check');
    });

    test('back calls history.back', () => {
        // Just verify it doesn't throw
        expect(() => back()).not.toThrow();
    });

    test('forward calls history.forward', () => {
        expect(() => forward()).not.toThrow();
    });
});
