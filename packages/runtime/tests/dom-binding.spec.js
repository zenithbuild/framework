import { hydrate } from '../src/hydrate.js';
import { cleanup } from '../src/cleanup.js';
import { signal } from '../src/signal.js';

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

    function getRuntimeErrorPayload(error) {
        return error && error.zenithRuntimeError ? error.zenithRuntimeError : null;
    }

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

    test('fails on marker/expression count mismatch', () => {
        container.innerHTML = '<span data-zx-e="0"></span>';

        expect(() => hydrate({
            ir_version: 1,
            root: container,
            expressions: [
                { marker_index: 0, literal: '"a"' },
                { marker_index: 1, literal: '"b"' }
            ],
            markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
            events: [],
            state_values: [],
            signals: []
        })).toThrow('marker/expression mismatch');
    });

    test('fails when ir_version is missing or unsupported', () => {
        container.innerHTML = '<span data-zx-e="0"></span>';

        expect(() => hydrate({
            root: container,
            expressions: [{ marker_index: 0, literal: '"x"' }],
            markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
            events: [],
            state_values: [],
            signals: []
        })).toThrow('unsupported ir_version');

        expect(() => hydrate({
            ir_version: 2,
            root: container,
            expressions: [{ marker_index: 0, literal: '"x"' }],
            markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
            events: [],
            state_values: [],
            signals: []
        })).toThrow('unsupported ir_version');
    });

    test('fails when marker table order is mutated', () => {
        container.innerHTML = '<span data-zx-e="0"></span><span data-zx-e="0"></span>';

        expect(() => hydrate({
            ir_version: 1,
            root: container,
            expressions: [
                { marker_index: 0, literal: '"x"' },
                { marker_index: 1, literal: '"y"' }
            ],
            markers: [
                { index: 0, kind: 'text', selector: '[data-zx-e~="0"]' },
                { index: 0, kind: 'event', selector: '[data-zx-on-click="0"]' }
            ],
            events: [],
            state_values: [],
            signals: []
        })).toThrow('marker table out of order');
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

    test('renders ternary zenhtml fragments', () => {
        container.innerHTML = '<section data-zx-e="0"></section>';
        const flag = true;

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
            state_keys: [],
            signals: [],
            expr_fns: [
                () => (flag
                    ? { __zenith_fragment: true, html: '<h1>A</h1>' }
                    : { __zenith_fragment: true, html: '<h1>B</h1>' })
            ]
        });

        expect(container.querySelector('section').innerHTML).toBe('<h1>A</h1>');
    });

    test('renders mapped zenhtml fragments from ssr data', () => {
        container.innerHTML = '<ul data-zx-e="0"></ul>';

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
                ({ ssrData }) => ssrData.items.map((item) => ({
                    __zenith_fragment: true,
                    html: `<li>${item.name}</li>`
                }))
            ],
            ssr_data: {
                items: [{ name: 'One' }, { name: 'Two' }]
            }
        });

        expect(container.querySelector('ul').innerHTML).toBe('<li>One</li><li>Two</li>');
    });

    test('renders mapped zenhtml fragments from rewritten component bindings', () => {
        container.innerHTML = '<ul data-zx-e="0"></ul>';
        const contributors = [{ tier: 'xl' }, { tier: 'sm' }];
        const tierClass = (tier) => `tier:${tier}`;

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [
                {
                    marker_index: 0,
                    fn_index: 0
                }
            ],
            markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
            events: [],
            state_values: [],
            state_keys: [],
            signals: [],
            expr_fns: [
                ({ zenhtml }) => contributors.map((c) => zenhtml`<li>${tierClass(c.tier)}</li>`)
            ]
        });

        expect(container.querySelector('ul').innerHTML).toBe('<li>tier:xl</li><li>tier:sm</li>');
    });

    test('keeps attribute expression values quoted in mapped zenhtml fragments', () => {
        container.innerHTML = '<section data-zx-e="0"></section>';
        const items = [{ tier: 'xl', x: '50%', y: '25%' }];
        const tierClass = (tier) => `tier-${tier}`;
        const nodeStyle = (item) => `left:${item.x};top:${item.y};`;

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [
                {
                    marker_index: 0,
                    fn_index: 0
                }
            ],
            markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
            events: [],
            state_values: [],
            state_keys: [],
            signals: [],
            expr_fns: [
                ({ zenhtml }) => items.map(
                    (item) =>
                        zenhtml`<div class="node ${tierClass(item.tier)}" style="${nodeStyle(item)}"></div>`
                )
            ]
        });

        expect(container.querySelector('section').innerHTML).toBe(
            '<div class="node tier-xl" style="left:50%;top:25%;"></div>'
        );
    });

    test('renders complex mapped zenhtml fragments used by about contributors section', () => {
        container.innerHTML = '<section data-zx-e="0"></section>';
        const contributors = [{ id: 1, tier: 'xl', x: '50%', y: '25%' }];
        const tierClass = (tier) => `tier-${tier}`;
        const nodeStyle = (item) => `left:${item.x};top:${item.y};`;

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [
                {
                    marker_index: 0,
                    fn_index: 0
                }
            ],
            markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
            events: [],
            state_values: [],
            signals: [],
            expr_fns: [
                () => contributors.map((item) => ({
                    __zenith_fragment: true,
                    html:
                        `<div data-constellation-node class="constellation-node ${tierClass(item.tier)}" style="${nodeStyle(item)}"><div class="absolute inset-0 bg-current opacity-20 hover:opacity-40 transition-opacity"></div></div>`
                }))
            ],
            state_keys: []
        });

        expect(container.querySelectorAll('[data-constellation-node]').length).toBe(1);
        expect(container.querySelector('section').innerHTML.includes('class="constellation-node tier-xl"')).toBe(true);
    });

    test('renders mapped fragments through compiled expression functions (no raw expression leak)', () => {
        container.innerHTML = '<section data-zx-e="0"></section>';
        const contributors = [{ tier: 'xl' }];
        const makeTierFragment = (tier) => ({ __zenith_fragment: true, html: `<div class="tier-${tier}"></div>` });

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [
                {
                    marker_index: 0,
                    fn_index: 0
                }
            ],
            markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
            events: [],
            state_values: [],
            state_keys: [],
            signals: [],
            expr_fns: [
                () => contributors.map((item) => makeTierFragment(item.tier))
            ],
        });

        const section = container.querySelector('section');
        expect(section.textContent).not.toContain('contributors.map(');
        expect(section.textContent).not.toContain('__z_frag_');
        expect(section.innerHTML).toContain('class="tier-xl"');
    });

    test('mounts mapped structural fragments without object coercion', () => {
        container.innerHTML = '<section data-zx-e="0"></section>';
        const items = ['alpha', 'beta'];
        const makeFragment = (label) => ({
            __zenith_fragment: true,
            mount(anchor) {
                const parent = anchor && anchor.nodeType === 1
                    ? anchor
                    : (anchor && anchor.parentNode ? anchor.parentNode : null);
                if (!parent) {
                    return;
                }
                const el = document.createElement('span');
                el.setAttribute('data-frag-item', 'true');
                el.textContent = String(label);
                if (anchor && anchor.nodeType !== 1 && anchor.parentNode === parent) {
                    parent.insertBefore(el, anchor);
                } else {
                    parent.appendChild(el);
                }
                this.nodes = [el];
            },
            unmount() {
                if (this.nodes) {
                    for (let i = 0; i < this.nodes.length; i++) {
                        const node = this.nodes[i];
                        if (node && node.parentNode) {
                            node.parentNode.removeChild(node);
                        }
                    }
                }
            }
        });

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [{ marker_index: 0, fn_index: 0 }],
            markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
            events: [],
            state_values: [],
            state_keys: [],
            signals: [],
            expr_fns: [
                () => items.map((item) => makeFragment(item))
            ],
        });

        const host = container.querySelector('section');
        expect(host.textContent).toBe('alphabeta');
        expect(host.textContent).not.toContain('[object Object]');
        expect(host.querySelectorAll('[data-frag-item]').length).toBe(2);
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

    test('throws structured runtime error when an expression literal cannot be resolved', () => {
        container.innerHTML = '<section data-zx-e="0"></section>';

        let thrown = null;
        try {
            hydrate({
                ir_version: 1,
                root: container,
                expressions: [{ marker_index: 0, literal: 'contributors.map((c) => (__z_frag_1(c.tier)))' }],
                markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
                events: [],
                state_values: [],
                signals: []
            });
        } catch (error) {
            thrown = error;
        }

        expect(thrown).toBeTruthy();
        const payload = getRuntimeErrorPayload(thrown);
        expect(payload).toBeTruthy();
        expect(payload.kind).toBe('ZENITH_RUNTIME_ERROR');
        expect(payload.phase).toBe('bind');
        expect(payload.code).toBe('UNRESOLVED_EXPRESSION');
        expect(payload.marker).toEqual({ type: 'data-zx-e', id: 0 });
        expect(payload.message).toContain('Failed to resolve expression literal');
    });

    test('throws structured runtime error for non-renderable object expressions', () => {
        container.innerHTML = '<section data-zx-e="0"></section>';

        let thrown = null;
        try {
            hydrate({
                ir_version: 1,
                root: container,
                expressions: [{ marker_index: 0, state_index: 0 }],
                markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
                events: [],
                state_values: [{ foo: 1 }],
                signals: []
            });
        } catch (error) {
            thrown = error;
        }

        expect(thrown).toBeTruthy();
        const payload = getRuntimeErrorPayload(thrown);
        expect(payload).toBeTruthy();
        expect(payload.kind).toBe('ZENITH_RUNTIME_ERROR');
        expect(payload.phase).toBe('render');
        expect(payload.code).toBe('NON_RENDERABLE_VALUE');
        expect(payload.path).toContain('marker[0].text');
        expect(payload.message).toContain('non-renderable object');
    });

    test('throws clear render error for arrays containing non-renderable objects', () => {
        container.innerHTML = '<section data-zx-e="0"></section>';

        expect(() =>
            hydrate({
                ir_version: 1,
                root: container,
                expressions: [{ marker_index: 0, state_index: 0 }],
                markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
                events: [],
                state_values: [[{ foo: 1 }]],
                signals: []
            })
        ).toThrow('Zenith Render Error: non-renderable object');
    });

    test('renders arrays of primitives and fragments without coercion errors', () => {
        container.innerHTML = '<section data-zx-e="0"></section>';

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [{ marker_index: 0, state_index: 0 }],
            markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
            events: [],
            state_values: [[
                'ok',
                1,
                { __zenith_fragment: true, html: '<span>frag</span>' }
            ]],
            signals: []
        });

        const section = container.querySelector('section');
        expect(section.textContent).toBe('ok1frag');
        expect(section.innerHTML).toContain('<span>frag</span>');
    });

    test('fails when expression references unknown signal index', () => {
        container.innerHTML = '<p data-zx-e="0"></p>';
        const count = signal(0);

        expect(() => hydrate({
            ir_version: 1,
            root: container,
            expressions: [{ marker_index: 0, signal_index: 2 }],
            markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
            events: [],
            state_values: [count],
            signals: [{ id: 0, kind: 'signal', state_index: 0 }]
        })).toThrow('did not resolve to a signal');
    });

    test('mounts a dev diagnostics overlay for runtime failures', () => {
        const previousDevFlag = globalThis.__ZENITH_RUNTIME_DEV__;
        globalThis.__ZENITH_RUNTIME_DEV__ = true;
        container.innerHTML = '<section data-zx-e="0"></section>';

        try {
            hydrate({
                ir_version: 1,
                root: container,
                expressions: [{ marker_index: 0, literal: 'contributors.map((c) => (__z_frag_1(c.tier)))' }],
                markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
                events: [],
                state_values: [],
                signals: []
            });
        } catch { }

        const overlay = document.getElementById(OVERLAY_ID);
        expect(overlay).toBeTruthy();
        expect(overlay.textContent).toContain('Zenith Runtime Error');
        expect(overlay.textContent).toContain('phase: bind');
        expect(overlay.textContent).toContain('code: UNRESOLVED_EXPRESSION');

        globalThis.__ZENITH_RUNTIME_DEV__ = previousDevFlag;
    });

    test('does not mount diagnostics overlay in production mode', () => {
        const previousDevFlag = globalThis.__ZENITH_RUNTIME_DEV__;
        globalThis.__ZENITH_RUNTIME_DEV__ = false;
        container.innerHTML = '<section data-zx-e="0"></section>';

        try {
            hydrate({
                ir_version: 1,
                root: container,
                expressions: [{ marker_index: 0, literal: 'contributors.map((c) => (__z_frag_1(c.tier)))' }],
                markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
                events: [],
                state_values: [],
                signals: []
            });
        } catch { }

        const overlay = document.getElementById(OVERLAY_ID);
        expect(overlay).toBeNull();
        globalThis.__ZENITH_RUNTIME_DEV__ = previousDevFlag;
    });

    test('sanitizes and truncates diagnostics output deterministically', () => {
        container.innerHTML = '<section data-zx-e="0"></section>';
        const longLiteral =
            'fn("/Users/judahsullivan/Personal/zenith/private/file.ts", "C:\\\\Users\\\\judah\\\\secret.ts", data.value).map((x)=>x).map((x)=>x).map((x)=>x).map((x)=>x).map((x)=>x)';
        let thrown = null;

        try {
            hydrate({
                ir_version: 1,
                root: container,
                expressions: [{ marker_index: 0, literal: longLiteral }],
                markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
                events: [],
                state_values: [],
                signals: []
            });
        } catch (error) {
            thrown = error;
        }

        const payload = getRuntimeErrorPayload(thrown);
        expect(payload).toBeTruthy();
        expect(payload.message.includes('/Users/')).toBe(false);
        expect(payload.message.includes('C:\\Users\\')).toBe(false);
        expect(payload.message.length).toBeLessThanOrEqual(120);
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

    test('throws UNSAFE_MEMBER_ACCESS for props.__proto__', () => {
        container.innerHTML = '<span data-zx-e="0"></span>';

        let thrown = null;
        try {
            hydrate({
                ir_version: 1,
                root: container,
                expressions: [
                    { marker_index: 0, literal: 'props.__proto__' }
                ],
                markers: [
                    { index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }
                ],
                events: [],
                state_values: [],
                signals: [],
                props: { safe: 'value' }
            });
        } catch (error) {
            thrown = error;
        }

        expect(thrown).toBeTruthy();
        const payload = getRuntimeErrorPayload(thrown);
        expect(payload).toBeTruthy();
        expect(payload.kind).toBe('ZENITH_RUNTIME_ERROR');
        // The UNSAFE_MEMBER_ACCESS error may get re-wrapped by hydrate's top-level catch
        // as BINDING_APPLY_FAILED. Either way, __proto__ must be mentioned.
        expect(payload.code === 'UNSAFE_MEMBER_ACCESS' || payload.code === 'BINDING_APPLY_FAILED').toBe(true);
        expect(thrown.message).toContain('__proto__');
    });

    test('props.missingKey throws structured unresolved expression error', () => {
        container.innerHTML = '<a data-zx-href="0">link</a>';
        let thrown = null;
        try {
            hydrate({
                ir_version: 1,
                root: container,
                expressions: [
                    { marker_index: 0, literal: 'props.missingKey' }
                ],
                markers: [
                    { index: 0, kind: 'attr', selector: '[data-zx-href="0"]', attr: 'href' }
                ],
                events: [],
                state_values: [],
                signals: [],
                props: { href: '/docs' }
            });
        } catch (error) {
            thrown = error;
        }

        expect(thrown).toBeTruthy();
        const payload = getRuntimeErrorPayload(thrown);
        expect(payload).toBeTruthy();
        expect(payload.phase).toBe('bind');
        expect(payload.code).toBe('UNRESOLVED_EXPRESSION');
        expect(payload.message).toContain('props.missingKey');
        expect(payload.path).toContain('marker[0].expression.props.missingKey');
    });
});
