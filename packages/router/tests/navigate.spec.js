// ---------------------------------------------------------------------------
// navigate.spec.js — Navigation API tests
// ---------------------------------------------------------------------------

import {
    navigate,
    refreshCurrentRoute,
    back,
    forward,
    getCurrentPath,
    _setNavigationResolver,
    _setRefreshResolver
} from '../dist/navigate.js';

describe('Navigation API', () => {
    afterEach(() => {
        _setNavigationResolver(null);
        _setRefreshResolver(null);
        delete globalThis.__zenith_refresh_current_route;
    });

    test('navigate pushes path to history', async () => {
        await navigate('/about');
        expect(getCurrentPath()).toBe('/about');
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
        expect(getCurrentPath()).toBe('/safe');
    });

    test('refreshCurrentRoute triggers explicit refresh resolver if set', async () => {
        const calls = [];
        _setRefreshResolver(async () => {
            calls.push(getCurrentPath());
        });

        history.pushState({}, '', '/refresh-me');
        await refreshCurrentRoute();

        expect(calls).toEqual(['/refresh-me']);
    });

    test('refreshCurrentRoute falls back to the template bridge on global scope', async () => {
        const calls = [];
        globalThis.__zenith_refresh_current_route = async () => {
            calls.push(getCurrentPath());
        };

        history.pushState({}, '', '/from-template');
        await refreshCurrentRoute();

        expect(calls).toEqual(['/from-template']);
    });

    test('refreshCurrentRoute fails clearly without a current route bridge', async () => {
        await expect(refreshCurrentRoute()).rejects.toThrow(
            '[Zenith Router] refreshCurrentRoute() requires a current matched Zenith page route'
        );
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
