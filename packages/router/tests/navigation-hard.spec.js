import { JSDOM } from 'jsdom';
import { generate_router_runtime_js } from '../../zenith-bundler/src/router_runtime.rs';

// We extract it from the actual Rust string in this repo.
// For the JS test, it's easier to just read the RS file or compile it.
// Actually wait, let's just test against the generated template.js module directly!
import { renderRouterModule } from '../template.js';

describe('Zenith Router Navigation Constraints', () => {
    test('Router runtime does not intercept with pushState, it uses location.assign', () => {
        const dom = new JSDOM(`
            <!doctype html>
            <html>
                <body>
                    <a id="link" href="/about">About</a>
                </body>
            </html>
        `, {
            url: 'http://localhost:4000/'
        });

        const { window } = dom;

        // Mock window.location.assign since JSDOM doesn't implement navigation natively
        let assignedUrl = null;
        Object.defineProperty(window, 'location', {
            value: {
                ...window.location,
                assign: jest.fn((url) => { assignedUrl = url; })
            }
        });

        // Mock history.pushState
        window.history.pushState = jest.fn();

        // Inject the required globals
        window.__ZENITH_MANIFEST__ = {
            chunks: {
                '/': '/dist/home.js',
                '/about': '/dist/about.js'
            },
            server_routes: []
        };

        // Render the router runtime script
        const routerScriptStr = renderRouterModule({
            manifestJson: JSON.stringify(window.__ZENITH_MANIFEST__),
            runtimeImport: '/dist/runtime.js',
            coreImport: '/dist/core.js'
        });

        // Evaluate the runtime in the JSDOM context
        const scriptEl = window.document.createElement('script');
        scriptEl.textContent = routerScriptStr;
        window.document.body.appendChild(scriptEl);

        // Simulate click
        const a = window.document.getElementById('link');
        const ev = new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
        a.dispatchEvent(ev);

        expect(window.history.pushState).not.toHaveBeenCalled();
        expect(window.location.assign).toHaveBeenCalledWith('http://localhost:4000/about');
        expect(assignedUrl).toBe('http://localhost:4000/about');
    });
});
