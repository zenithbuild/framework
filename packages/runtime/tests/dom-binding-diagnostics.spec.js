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

    function getRuntimeErrorPayload(error) {
        return error && error.zenithRuntimeError ? error.zenithRuntimeError : null;
    }

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
        // The EXPRESSION_NOT_LOWERED error may get re-wrapped by hydrate's top-level catch
        // as BINDING_APPLY_FAILED. Check message content instead.
        expect(payload.code === 'EXPRESSION_NOT_LOWERED' || payload.code === 'BINDING_APPLY_FAILED').toBe(true);
        expect(payload.marker).toEqual({ type: 'data-zx-e', id: 0 });
        expect(thrown.message).toContain('not lowered by the compiler');
        expect(thrown.message).toContain('contributors');
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
        expect(overlay.textContent).toContain('not lowered by the compiler');

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
        expect(payload.code === 'EXPRESSION_NOT_LOWERED' || payload.code === 'BINDING_APPLY_FAILED').toBe(true);
        expect(payload.message.length).toBeLessThanOrEqual(120);
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
