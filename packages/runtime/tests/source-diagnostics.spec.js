import { hydrate } from '../dist/hydrate.js';
import { cleanup } from '../dist/cleanup.js';

describe('runtime source diagnostics', () => {
    const OVERLAY_ID = '__zenith_runtime_error_overlay';
    const SOURCE_SPAN = {
        file: 'src/pages/index.zen',
        start: { line: 18, column: 7 },
        end: { line: 18, column: 27 }
    };
    let container;
    let previousDevFlag;

    function removeOverlay() {
        const overlay = document.getElementById(OVERLAY_ID);
        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
    }

    function triggerEventBindingResolutionError() {
        container.innerHTML = '<button data-zx-on-click="0">+</button>';
        try {
            hydrate({
                ir_version: 1,
                root: container,
                expressions: [{ marker_index: 0, state_index: 0, source: SOURCE_SPAN }],
                markers: [{ index: 0, kind: 'event', selector: '[data-zx-on-click="0"]', source: SOURCE_SPAN }],
                events: [{ index: 0, event: 'click', selector: '[data-zx-on-click="0"]', source: SOURCE_SPAN }],
                state_values: [42],
                signals: []
            });
        } catch (error) {
            return error;
        }
        throw new Error('Expected hydrate() to throw runtime error');
    }

    beforeEach(() => {
        previousDevFlag = globalThis.__ZENITH_RUNTIME_DEV__;
        globalThis.__ZENITH_RUNTIME_DEV__ = true;
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        cleanup();
        removeOverlay();
        if (container && container.parentNode) {
            container.parentNode.removeChild(container);
        }
        globalThis.__ZENITH_RUNTIME_DEV__ = previousDevFlag;
    });

    test('attaches source spans to runtime payload when provided', () => {
        const thrown = triggerEventBindingResolutionError();
        expect(thrown?.zenithRuntimeError?.code).toBe('BINDING_APPLY_FAILED');
        expect(thrown?.zenithRuntimeError?.marker).toEqual({ type: 'data-zx-on-click', id: 0 });
        expect(thrown?.zenithRuntimeError?.source).toEqual(SOURCE_SPAN);
        expect(thrown?.zenithRuntimeError?.docsLink).toContain('runtime-contract');
    });

    test('runtime overlay renders source location details', () => {
        triggerEventBindingResolutionError();
        const overlay = document.getElementById(OVERLAY_ID);
        expect(overlay).toBeTruthy();
        expect(overlay.textContent).toContain('source: src/pages/index.zen:18:7');
        expect(overlay.textContent).toContain('event[0].click');
    });

    test('runtime payload is deterministic across repeated failures', () => {
        const first = triggerEventBindingResolutionError().zenithRuntimeError;
        removeOverlay();
        const second = triggerEventBindingResolutionError().zenithRuntimeError;

        expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    });
});
