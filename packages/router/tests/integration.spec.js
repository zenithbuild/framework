// ---------------------------------------------------------------------------
// integration.spec.js — Full router lifecycle tests
// ---------------------------------------------------------------------------

import { createRouter } from '../src/router.js';
import { navigate, getCurrentPath } from '../src/navigate.js';
import { onRouteChange, _clearSubscribers } from '../src/events.js';
import * as routerApi from '../src/index.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

describe('Integration: createRouter + lifecycle', () => {
    let container;
    let mounted;
    let cleaned;

    const mockMount = (el, mod) => {
        mounted.push(mod);
        el.innerHTML = mod.__html || '';
    };

    const mockCleanup = () => {
        cleaned++;
    };

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        mounted = [];
        cleaned = 0;
    });

    afterEach(() => {
        document.body.removeChild(container);
        _clearSubscribers();
    });

    test('start() resolves initial route by pathname', async () => {
        history.pushState({}, '', '/about');

        const routes = [
            {
                path: '/',
                load: async () => ({ __html: '<h1>Home</h1>' })
            },
            {
                path: '/about',
                load: async () => ({ __html: '<h1>About</h1>' })
            }
        ];

        const router = createRouter({ routes, container, mount: mockMount, cleanup: mockCleanup });
        await router.start();

        expect(mounted.length).toBe(1);
        expect(mounted[0].__html).toBe('<h1>About</h1>');

        router.destroy();
    });

    test('navigate triggers match → mount cycle', async () => {
        history.pushState({}, '', '/');

        const routes = [
            {
                path: '/',
                load: async () => ({ __html: '<h1>Home</h1>' })
            },
            {
                path: '/contact',
                load: async () => ({ __html: '<h1>Contact</h1>' })
            }
        ];

        const router = createRouter({ routes, container, mount: mockMount, cleanup: mockCleanup });
        await router.start();

        await navigate('/contact');

        expect(mounted.length).toBe(2);
        expect(mounted[1].__html).toBe('<h1>Contact</h1>');
        expect(cleaned).toBe(1); // previous page cleaned up

        router.destroy();
    });

    test('navigate to unmatched route fires onRouteChange with matched: false', async () => {
        const changes = [];
        const unsub = onRouteChange((d) => changes.push(d));

        const routes = [
            { path: '/', load: async () => ({}) }
        ];

        const router = createRouter({ routes, container, mount: mockMount, cleanup: mockCleanup });
        history.pushState({}, '', '/');
        await router.start();

        await navigate('/nonexistent');

        const unmatched = changes.find(c => !c.matched);
        expect(unmatched).toBeDefined();
        expect(unmatched.path).toBe('/nonexistent');

        unsub();
        router.destroy();
    });

    test('param routes pass params to load function', async () => {
        let receivedParams = null;

        const routes = [
            {
                path: '/users/:id',
                load: async (params) => {
                    receivedParams = params;
                    return { __html: `<p>User ${params.id}</p>` };
                }
            }
        ];

        const router = createRouter({ routes, container, mount: mockMount, cleanup: mockCleanup });
        history.pushState({}, '', '/users/42');
        await router.start();

        expect(receivedParams).toEqual({ id: '42' });
        expect(mounted[0].__html).toBe('<p>User 42</p>');

        router.destroy();
    });

    test('onRouteChange fires on each navigation', async () => {
        const changes = [];
        const unsub = onRouteChange((d) => changes.push(d));

        const routes = [
            { path: '/', load: async () => ({}) },
            { path: '/a', load: async () => ({}) },
            { path: '/b', load: async () => ({}) }
        ];

        const router = createRouter({ routes, container, mount: mockMount, cleanup: mockCleanup });
        history.pushState({}, '', '/');
        await router.start();

        await navigate('/a');
        await navigate('/b');

        expect(changes.length).toBe(3); // initial + 2 navigations
        expect(changes.map(c => c.path)).toEqual(['/', '/a', '/b']);

        unsub();
        router.destroy();
    });

    test('destroy stops listening and clears resolver', async () => {
        const routes = [
            { path: '/', load: async () => ({}) },
            { path: '/after', load: async () => ({}) }
        ];

        const router = createRouter({ routes, container, mount: mockMount, cleanup: mockCleanup });
        history.pushState({}, '', '/');
        await router.start();

        router.destroy();

        // Navigate after destroy should not trigger mount
        const countBefore = mounted.length;
        await navigate('/after');
        expect(mounted.length).toBe(countBefore); // navigate pushes history but resolver is null

        router.destroy(); // idempotent
    });

    test('start() is idempotent', async () => {
        const routes = [
            { path: '/', load: async () => ({}) }
        ];

        const router = createRouter({ routes, container, mount: mockMount, cleanup: mockCleanup });
        history.pushState({}, '', '/');
        await router.start();
        await router.start(); // second call is no-op

        expect(mounted.length).toBe(1);

        router.destroy();
    });

    test('throws on invalid container', () => {
        expect(() => createRouter({ routes: [{ path: '/', load: () => { } }], container: null }))
            .toThrow('[Zenith Router]');
    });

    test('throws on empty routes', () => {
        expect(() => createRouter({ routes: [], container: document.createElement('div') }))
            .toThrow('[Zenith Router]');
    });

    test('rapid sequential navigations settle correctly', async () => {
        const routes = [];
        for (let i = 0; i < 10; i++) {
            routes.push({
                path: `/page/${i}`,
                load: async () => ({ __html: `<p>${i}</p>` })
            });
        }

        const router = createRouter({ routes, container, mount: mockMount, cleanup: mockCleanup });
        history.pushState({}, '', '/page/0');
        await router.start();

        for (let i = 1; i < 10; i++) {
            await navigate(`/page/${i}`);
        }

        expect(mounted.length).toBe(10);
        expect(mounted[9].__html).toBe('<p>9</p>');

        router.destroy();
    });
});

describe('Contract Guardrails', () => {
    test('public API exports exactly seven symbols', () => {
        const exports = Object.keys(routerApi).sort();
        expect(exports).toEqual([
            'back',
            'createRouter',
            'forward',
            'getCurrentPath',
            'matchRoute',
            'navigate',
            'onRouteChange'
        ]);
    });

    test('template subpath exports renderRouterModule only', async () => {
        const templateApi = await import('@zenithbuild/router/template');
        expect(Object.keys(templateApi).sort()).toEqual(['renderRouterModule']);
        expect(typeof templateApi.renderRouterModule).toBe('function');
    });

    test('router source does not use forbidden execution primitives', () => {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const srcDir = path.resolve(__dirname, '../src');
        const files = fs.readdirSync(srcDir).filter((name) => name.endsWith('.js'));

        for (let i = 0; i < files.length; i++) {
            const source = fs.readFileSync(path.join(srcDir, files[i]), 'utf8');
            expect(source.includes('eval(')).toBe(false);
            expect(source.includes('new Function')).toBe(false);
            expect(source.includes('document.write')).toBe(false);
        }
    });

    test('router source does not reference window globals beyond history/popstate', () => {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const srcDir = path.resolve(__dirname, '../src');
        const files = fs.readdirSync(srcDir).filter((name) => name.endsWith('.js'));

        const allowedWindowRefs = ['window.addEventListener', 'window.removeEventListener', 'window.location', 'window.dispatchEvent'];

        for (let i = 0; i < files.length; i++) {
            const source = fs.readFileSync(path.join(srcDir, files[i]), 'utf8');
            const windowRefs = source.match(/window\.\w+/g) || [];

            for (const ref of windowRefs) {
                expect(allowedWindowRefs.some(a => ref.startsWith(a.split('(')[0]))).toBe(true);
            }
        }
    });

    test('no VDOM, no diffing, no component abstraction in source', () => {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const srcDir = path.resolve(__dirname, '../src');
        const files = fs.readdirSync(srcDir).filter((name) => name.endsWith('.js'));

        const forbidden = ['createElement', 'createComponent', 'diffDOM', 'patch(', 'vdom', 'virtualDOM', 'jsx'];

        for (let i = 0; i < files.length; i++) {
            const source = fs.readFileSync(path.join(srcDir, files[i]), 'utf8');
            for (const term of forbidden) {
                expect(source.includes(term)).toBe(false);
            }
        }
    });
});
