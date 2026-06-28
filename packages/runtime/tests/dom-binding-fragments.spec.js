import { hydrate } from '../dist/hydrate.js';
import { cleanup } from '../dist/cleanup.js';

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


    test('renders ternary embedded fragments', () => {
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
                ({ fragment }) => (flag
                    ? fragment`<h1>A</h1>`
                    : fragment`<h1>B</h1>`)
            ]
        });

        expect(container.querySelector('section').innerHTML).toBe('<h1>A</h1>');
    });

    test('renders mapped embedded fragments from ssr data', () => {
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
                ({ ssrData, fragment }) => ssrData.items.map((item) => fragment`<li>${item.name}</li>`)
            ],
            ssr_data: {
                items: [{ name: 'One' }, { name: 'Two' }]
            }
        });

        expect(container.querySelector('ul').innerHTML).toBe('<li>One</li><li>Two</li>');
    });

    test('renders mapped fragments from rewritten component bindings', () => {
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
                ({ fragment }) => contributors.map((c) => fragment`<li>${tierClass(c.tier)}</li>`)
            ]
        });

        expect(container.querySelector('ul').innerHTML).toBe('<li>tier:xl</li><li>tier:sm</li>');
    });

    test('keeps attribute expression values quoted in mapped fragments', () => {
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
                ({ fragment }) => items.map(
                    (item) =>
                        fragment`<div class="node ${tierClass(item.tier)}" style="${nodeStyle(item)}"></div>`
                )
            ]
        });

        expect(container.querySelector('section').innerHTML).toBe(
            '<div class="node tier-xl" style="left:50%;top:25%;"></div>'
        );
    });

    test('renders complex mapped fragments used by about contributors section', () => {
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
                ({ fragment }) => contributors.map((item) =>
                    fragment`<div data-constellation-node class="constellation-node ${tierClass(item.tier)}" style="${nodeStyle(item)}"><div class="absolute inset-0 bg-current opacity-20 hover:opacity-40 transition-opacity"></div></div>`
                )
            ],
            state_keys: []
        });

        expect(container.querySelectorAll('[data-constellation-node]').length).toBe(1);
        expect(container.querySelector('section').innerHTML.includes('class="constellation-node tier-xl"')).toBe(true);
    });

    test('renders mapped fragments through compiled expression functions (no raw expression leak)', () => {
        container.innerHTML = '<section data-zx-e="0"></section>';
        const contributors = [{ tier: 'xl' }];

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
                ({ fragment }) => contributors.map((item) => fragment`<div class="tier-${item.tier}"></div>`)
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
                const parent = anchor && (anchor.nodeType === 1 || anchor.nodeType === 11)
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

    test('renders arrays of primitives and fragments without coercion errors', () => {
        container.innerHTML = '<section data-zx-e="0"></section>';

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
                ({ fragment }) => ['ok', 1, fragment`<span>frag</span>`]
            ]
        });

        const section = container.querySelector('section');
        expect(section.textContent).toBe('ok1frag');
        expect(section.innerHTML).toContain('<span>frag</span>');
    });

});
