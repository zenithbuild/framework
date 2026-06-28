import { hydrate } from '../dist/hydrate.js';
import { cleanup } from '../dist/cleanup.js';

describe('hydrate integration contract', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        container.innerHTML = '<p data-zx-e="0"></p>';
        document.body.appendChild(container);
    });

    afterEach(() => {
        cleanup();
        document.body.removeChild(container);
    });

    // ── Functional drift gates for compiler-owned fragment rendering ─────────

    test('fragment escapes interpolated HTML strings by default', () => {
        container.innerHTML = '<section data-zx-e="0"></section>';
        const injection = '<em>unsafe</em>';

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
            expr_fns: [({ fragment }) => fragment`<div>${injection}</div>`]
        });

        const div = container.querySelector('section div');
        expect(div.textContent).toBe(injection);
        expect(container.querySelector('section').innerHTML).toContain('&lt;em&gt;unsafe&lt;/em&gt;');
    });

    test('fragment rejects script tags in literal markup', () => {
        container.innerHTML = '<section data-zx-e="0"></section>';

        expect(() =>
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
                expr_fns: [({ fragment }) => fragment`<script>alert(1)</script>`]
            })
        ).toThrow(/forbidden.*script/i);
    });

    test('fragment rejects javascript: URLs in literal markup', () => {
        container.innerHTML = '<section data-zx-e="0"></section>';

        expect(() =>
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
                expr_fns: [({ fragment }) => fragment`<a href="javascript:alert(1)">link</a>`]
            })
        ).toThrow(/javascript.*URL/i);
    });

    test('fragment rejects non-renderable object interpolation', () => {
        container.innerHTML = '<section data-zx-e="0"></section>';
        const obj = { foo: 'bar' };

        expect(() =>
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
                expr_fns: [({ fragment }) => fragment`<div>${obj}</div>`]
            })
        ).toThrow(/non-renderable object/i);
    });

});
