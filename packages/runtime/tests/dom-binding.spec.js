import { hydrate } from '../dist/hydrate.js';
import { cleanup } from '../dist/cleanup.js';
import { signal } from '../dist/signal.js';

describe('hydrate() marker contract', () => {
    const OVERLAY_ID = '__zenith_runtime_error_overlay';
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        cleanup();
        const overlay = document.getElementById(OVERLAY_ID);
        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
        document.body.removeChild(container);
    });


    test('binds text and attribute markers by index', () => {
        container.innerHTML = '<h1 data-zx-e="0"></h1><a data-zx-href="1">go</a>';

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [
                { marker_index: 0, literal: '"Hello"' },
                { marker_index: 1, literal: '"/about"' }
            ],
            markers: [
                { index: 0, kind: 'text', selector: '[data-zx-e~="0"]' },
                { index: 1, kind: 'attr', selector: '[data-zx-href="1"]', attr: 'href' }
            ],
            events: [],
            state_values: [],
            signals: []
        });

        expect(container.querySelector('h1').textContent).toBe('Hello');
        expect(container.querySelector('a').getAttribute('href')).toBe('/about');
    });

    test('supports index-addressed state value bindings', () => {
        container.innerHTML = '<button data-zx-disabled="0">Save</button>';

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [{ marker_index: 0, state_index: 0 }],
            markers: [
                { index: 0, kind: 'attr', selector: '[data-zx-disabled="0"]', attr: 'disabled' }
            ],
            events: [],
            state_values: [true],
            signals: []
        });

        expect(container.querySelector('button').hasAttribute('disabled')).toBe(true);
    });

    test('updates DOM when bound signal changes', () => {
        container.innerHTML = '<p data-zx-e="0"></p>';
        const count = signal(0);

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [{ marker_index: 0, signal_index: 0 }],
            markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
            events: [],
            state_values: [count],
            signals: [{ id: 0, kind: 'signal', state_index: 0 }]
        });

        expect(container.querySelector('p').textContent).toBe('0');
        count.set(3);
        expect(container.querySelector('p').textContent).toBe('3');
    });

    test('renders boolean true as empty output', () => {
        container.innerHTML = '<p data-zx-e="0"></p>';

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [{ marker_index: 0, literal: 'true' }],
            markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
            events: [],
            state_values: [],
            signals: []
        });

        expect(container.querySelector('p').textContent).toBe('');
    });

    test('keeps ordinary text bindings escaped by default', () => {
        container.innerHTML = '<section data-zx-e="0"></section>';

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [{ marker_index: 0, literal: '"<img src=x onerror=alert(1)>"' }],
            markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
            events: [],
            state_values: [],
            signals: []
        });

        const section = container.querySelector('section');
        expect(section.textContent).toBe('<img src=x onerror=alert(1)>');
        expect(section.innerHTML).toBe('&lt;img src=x onerror=alert(1)&gt;');
    });

    test('rejects implicit innerHTML bindings', () => {
        container.innerHTML = '<section data-zx-innerHTML="0"></section>';

        expect(() =>
            hydrate({
                ir_version: 1,
                root: container,
                expressions: [{ marker_index: 0, literal: '"<strong>unsafe</strong>"' }],
                markers: [{ index: 0, kind: 'attr', selector: '[data-zx-innerHTML="0"]', attr: 'innerHTML' }],
                events: [],
                state_values: [],
                signals: []
            })
        ).toThrow(/innerHTML bindings are forbidden/i);
    });

    test('allows explicit unsafeHTML bindings', () => {
        container.innerHTML = '<section data-zx-unsafeHTML="0"></section>';

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [{ marker_index: 0, literal: '"<strong>unsafe</strong>"' }],
            markers: [{ index: 0, kind: 'attr', selector: '[data-zx-unsafeHTML="0"]', attr: 'unsafeHTML' }],
            events: [],
            state_values: [],
            signals: []
        });

        expect(container.querySelector('section').innerHTML).toBe('<strong>unsafe</strong>');
    });

    test('resolves signal-backed literal expressions with .get() (ThemeToggle shape)', () => {
        container.innerHTML = '<button data-zx-e="0"></button>';
        const isDark = signal(false);

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [
                {
                    marker_index: 0,
                    fn_index: 0,
                    signal_indices: [0]
                }
            ],
            markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
            events: [],
            state_values: [isDark],
            state_keys: ['isDark'],
            signals: [{ id: 0, kind: 'signal', state_index: 0 }],
            expr_fns: [({ signalMap }) => (signalMap.get(0).get() ? 'dark' : 'light')]
        });

        expect(container.querySelector('button').textContent).toBe('light');
    });

    test('resolves props.href member path and sets attribute', () => {
        container.innerHTML = '<a data-zen-btn data-zx-href="0">go</a>';

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [
                { marker_index: 0, literal: 'props.href' }
            ],
            markers: [
                { index: 0, kind: 'attr', selector: '[data-zx-href="0"]', attr: 'href' }
            ],
            events: [],
            state_values: [],
            signals: [],
            props: { href: '/docs', target: '_blank' }
        });

        expect(container.querySelector('a').getAttribute('href')).toBe('/docs');
    });

    test('resolves props.ariaLabel member path and sets aria-label attribute', () => {
        container.innerHTML = '<button data-zx-aria-label="0"></button>';

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [
                { marker_index: 0, literal: 'props.ariaLabel' }
            ],
            markers: [
                { index: 0, kind: 'attr', selector: '[data-zx-aria-label="0"]', attr: 'aria-label' }
            ],
            events: [],
            state_values: [],
            signals: [],
            props: { ariaLabel: 'Toggle theme' }
        });

        expect(container.querySelector('button').getAttribute('aria-label')).toBe('Toggle theme');
    });

    test('resolves data.model.view member chain in expression literals', () => {
        container.innerHTML = '<p data-zx-e="0"></p>';

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [
                { marker_index: 0, fn_index: 0 }
            ],
            markers: [
                { index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }
            ],
            events: [],
            state_values: [],
            signals: [],
            expr_fns: [
                ({ ssrData }) => (ssrData.model.view === 'docs' ? 'Docs View' : 'Other View')
            ],
            ssr_data: {
                model: {
                    view: 'docs'
                }
            }
        });

        expect(container.querySelector('p').textContent).toBe('Docs View');
    });

    test('resolves params.slug member path in bindings', () => {
        container.innerHTML = '<span data-zx-data-slug="0"></span>';

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [
                { marker_index: 0, literal: 'params.slug' }
            ],
            markers: [
                { index: 0, kind: 'attr', selector: '[data-zx-data-slug="0"]', attr: 'data-slug' }
            ],
            events: [],
            state_values: [],
            signals: [],
            params: { slug: 'getting-started' }
        });

        expect(container.querySelector('span').getAttribute('data-slug')).toBe('getting-started');
    });

});
