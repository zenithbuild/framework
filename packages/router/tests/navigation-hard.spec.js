import { renderRouterModule } from '../template.js';

describe('Zenith Router Navigation Constraints', () => {
    test('router runtime uses fetch-before-commit soft navigation with browser fallback', () => {
        const routerSource = renderRouterModule({
            manifestJson: JSON.stringify({
                chunks: {
                    '/': '/dist/home.js',
                    '/about': '/dist/about.js'
                },
                server_routes: ['/about']
            }),
            runtimeImport: '/dist/runtime.js',
            coreImport: '/dist/core.js'
        });

        expect(routerSource).toContain('fetch(targetUrl.href');
        expect(routerSource).toContain('history.pushState(');
        expect(routerSource).toContain('history.replaceState(');
        expect(routerSource).toContain('window.location.assign(targetUrl.href);');
        expect(routerSource).toContain('window.location.replace(targetUrl.href);');
        expect(routerSource).toContain('closest("a[data-zen-link]")');
        expect(routerSource).toContain('"navigation:request"');
        expect(routerSource).toContain('await emitNavigationEvent(context, "navigation:before-leave"');
        expect(routerSource).toContain('emitNavigationEvent(context, "navigation:enter-complete"');
    });
});
