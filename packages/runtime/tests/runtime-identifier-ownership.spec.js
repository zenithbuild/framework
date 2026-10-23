/**
 * runtime-identifier-ownership.spec.js — Phase 0 Track B regression locks
 *
 * These tests enforce the runtime identifier-interpretation reduction boundary:
 * - runtime resolves expressions through mechanical payload paths only
 * - no alias recovery from mangled state keys
 * - no heuristic expression guessing
 * - no regex-based identifier extraction
 * - literal resolution is bounded to static primitives and canonical member chains
 */

import { hydrate } from '../dist/hydrate.js';
import { cleanup } from '../dist/cleanup.js';
import { signal } from '../dist/signal.js';

describe('runtime identifier ownership boundary', () => {
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

    // ─── 1. fn_index payloads resolve without literal fallback ────────────

    test('fn_index payloads resolve directly without any literal interpretation', () => {
        container.innerHTML = '<p data-zx-e="0"></p>';

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [{ marker_index: 0, fn_index: 0 }],
            markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
            events: [],
            state_values: [],
            state_keys: [],
            signals: [],
            expr_fns: [() => 'compiler-owned']
        });

        expect(container.querySelector('p').textContent).toBe('compiler-owned');
    });

    // ─── 2. signal_index payloads resolve by index only ───────────────────

    test('signal_index payloads resolve by numeric index without name lookup', () => {
        container.innerHTML = '<p data-zx-e="0"></p>';
        const count = signal(42);

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [{ marker_index: 0, signal_index: 0 }],
            markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
            events: [],
            state_values: [count],
            signals: [{ id: 0, kind: 'signal', state_index: 0 }]
        });

        expect(container.querySelector('p').textContent).toBe('42');
    });

    // ─── 3. state_index payloads resolve by index only ────────────────────

    test('state_index payloads resolve by numeric index without name lookup', () => {
        container.innerHTML = '<span data-zx-e="0"></span>';

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [{ marker_index: 0, state_index: 0 }],
            markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
            events: [],
            state_values: ['index-resolved'],
            signals: []
        });

        expect(container.querySelector('span').textContent).toBe('index-resolved');
    });

    // ─── 4. Bounded canonical member chains still resolve ─────────────────

    test('props.* canonical member chain resolves', () => {
        container.innerHTML = '<a data-zx-href="0">go</a>';

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [{ marker_index: 0, literal: 'props.href' }],
            markers: [{ index: 0, kind: 'attr', selector: '[data-zx-href="0"]', attr: 'href' }],
            events: [],
            state_values: [],
            signals: [],
            props: { href: '/canonical' }
        });

        expect(container.querySelector('a').getAttribute('href')).toBe('/canonical');
    });

    test('params.* canonical member chain resolves', () => {
        container.innerHTML = '<span data-zx-data-slug="0"></span>';

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [{ marker_index: 0, literal: 'params.slug' }],
            markers: [{ index: 0, kind: 'attr', selector: '[data-zx-data-slug="0"]', attr: 'data-slug' }],
            events: [],
            state_values: [],
            signals: [],
            params: { slug: 'canonical-slug' }
        });

        expect(container.querySelector('span').getAttribute('data-slug')).toBe('canonical-slug');
    });

    test('data.* canonical member chain resolves', () => {
        container.innerHTML = '<p data-zx-e="0"></p>';

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [{ marker_index: 0, fn_index: 0 }],
            markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
            events: [],
            state_values: [],
            signals: [],
            expr_fns: [({ ssrData }) => ssrData.title],
            ssr_data: { title: 'canonical-data' }
        });

        expect(container.querySelector('p').textContent).toBe('canonical-data');
    });

    // ─── 5. Unrecognized base identifiers throw EXPRESSION_NOT_LOWERED ────

    test('unrecognized base identifiers in literals throw EXPRESSION_NOT_LOWERED', () => {
        container.innerHTML = '<section data-zx-e="0"></section>';

        let thrown = null;
        try {
            hydrate({
                ir_version: 1,
                root: container,
                expressions: [{ marker_index: 0, literal: 'unknownVar' }],
                markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
                events: [],
                state_values: [],
                state_keys: [],
                signals: []
            });
        } catch (error) {
            thrown = error;
        }

        expect(thrown).toBeTruthy();
        const payload = getRuntimeErrorPayload(thrown);
        expect(payload).toBeTruthy();
        expect(payload.code === 'EXPRESSION_NOT_LOWERED' || payload.code === 'BINDING_APPLY_FAILED').toBe(true);
        expect(thrown.message).toContain('not lowered by the compiler');
    });

    test('expression-like literals throw EXPRESSION_NOT_LOWERED without identifier extraction', () => {
        container.innerHTML = '<section data-zx-e="0"></section>';

        let thrown = null;
        try {
            hydrate({
                ir_version: 1,
                root: container,
                expressions: [{ marker_index: 0, literal: 'items.map((x) => x.name)' }],
                markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
                events: [],
                state_values: [],
                state_keys: [],
                signals: []
            });
        } catch (error) {
            thrown = error;
        }

        expect(thrown).toBeTruthy();
        const payload = getRuntimeErrorPayload(thrown);
        expect(payload).toBeTruthy();
        expect(payload.code === 'EXPRESSION_NOT_LOWERED' || payload.code === 'BINDING_APPLY_FAILED').toBe(true);
        // Must NOT contain old-style "Unresolved expression identifier" message
        expect(thrown.message).not.toContain('Unresolved expression identifier');
    });

    // ─── 6. Alias recovery from mangled state keys no longer works ────────

    test('alias recovery from __prefixed mangled state keys is closed', () => {
        container.innerHTML = '<span data-zx-e="0"></span>';

        // Previously, state key "__component_count" would have derived alias "count"
        // and `literal: 'count'` would have resolved through alias recovery.
        // After hardening, "count" is not a canonical base and not an exact state key,
        // so it must throw EXPRESSION_NOT_LOWERED.
        let thrown = null;
        try {
            hydrate({
                ir_version: 1,
                root: container,
                expressions: [{ marker_index: 0, literal: 'count' }],
                markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
                events: [],
                state_values: [5],
                state_keys: ['__component_count'],
                signals: []
            });
        } catch (error) {
            thrown = error;
        }

        expect(thrown).toBeTruthy();
        const payload = getRuntimeErrorPayload(thrown);
        expect(payload).toBeTruthy();
        expect(payload.code === 'EXPRESSION_NOT_LOWERED' || payload.code === 'BINDING_APPLY_FAILED').toBe(true);
    });

    test('exact mangled state key still resolves when used literally', () => {
        container.innerHTML = '<span data-zx-e="0"></span>';

        // The exact key "__component_count" IS in stateKeys, so an exact-key
        // literal reference must still resolve through bounded scope lookup.
        hydrate({
            ir_version: 1,
            root: container,
            expressions: [{ marker_index: 0, literal: '__component_count' }],
            markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
            events: [],
            state_values: [7],
            state_keys: ['__component_count'],
            signals: []
        });

        expect(container.querySelector('span').textContent).toBe('7');
    });

    // ─── 7. Heuristic expression shape guessing is removed ────────────────

    test('ternary-like literals throw EXPRESSION_NOT_LOWERED (no heuristic parsing)', () => {
        container.innerHTML = '<section data-zx-e="0"></section>';

        let thrown = null;
        try {
            hydrate({
                ir_version: 1,
                root: container,
                expressions: [{ marker_index: 0, literal: 'flag ? "yes" : "no"' }],
                markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
                events: [],
                state_values: [],
                state_keys: [],
                signals: []
            });
        } catch (error) {
            thrown = error;
        }

        expect(thrown).toBeTruthy();
        const payload = getRuntimeErrorPayload(thrown);
        expect(payload).toBeTruthy();
        expect(payload.code === 'EXPRESSION_NOT_LOWERED' || payload.code === 'BINDING_APPLY_FAILED').toBe(true);
        expect(thrown.message).toContain('not lowered by the compiler');
    });

    // ─── 8. Deterministic payload resolution ──────────────────────────────

    test('repeated hydrate calls with same payload produce deterministic results', () => {
        for (let run = 0; run < 3; run++) {
            cleanup();
            container.innerHTML = '<p data-zx-e="0"></p><a data-zx-href="1">go</a>';

            hydrate({
                ir_version: 1,
                root: container,
                expressions: [
                    { marker_index: 0, literal: '"deterministic"' },
                    { marker_index: 1, literal: 'props.href' }
                ],
                markers: [
                    { index: 0, kind: 'text', selector: '[data-zx-e~="0"]' },
                    { index: 1, kind: 'attr', selector: '[data-zx-href="1"]', attr: 'href' }
                ],
                events: [],
                state_values: [],
                signals: [],
                props: { href: '/stable' }
            });

            expect(container.querySelector('p').textContent).toBe('deterministic');
            expect(container.querySelector('a').getAttribute('href')).toBe('/stable');
        }
    });
});
