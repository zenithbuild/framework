import { hydrate } from '../src/hydrate.js';
import { cleanup, _getCounts } from '../src/cleanup.js';

describe('hydrate() event contract', () => {
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

    test('binds event listeners by explicit index', () => {
        let clicks = 0;
        container.innerHTML = '<button data-zx-on-click="0">+</button>';

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [{ marker_index: 0, state_index: 0 }],
            markers: [{ index: 0, kind: 'event', selector: '[data-zx-on-click="0"]' }],
            events: [{ index: 0, event: 'click', selector: '[data-zx-on-click="0"]' }],
            state_values: [() => { clicks += 1; }],
            signals: []
        });

        container.querySelector('button').click();
        container.querySelector('button').click();
        expect(clicks).toBe(2);
        expect(_getCounts().listeners).toBe(1);
    });

    test('fails when event expression does not resolve to function', () => {
        container.innerHTML = '<button data-zx-on-click="0">+</button>';

        expect(() => hydrate({
            ir_version: 1,
            root: container,
            expressions: [{ marker_index: 0, state_index: 0 }],
            markers: [{ index: 0, kind: 'event', selector: '[data-zx-on-click="0"]' }],
            events: [{ index: 0, event: 'click', selector: '[data-zx-on-click="0"]' }],
            state_values: [42],
            signals: []
        })).toThrow('did not resolve to a function');
    });

    test('surfaces structured EVENT_HANDLER_FAILED when handler throws', () => {
        container.innerHTML = '<button data-zx-on-click="0">+</button>';

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [{ marker_index: 0, state_index: 0 }],
            markers: [{ index: 0, kind: 'event', selector: '[data-zx-on-click="0"]' }],
            events: [{ index: 0, event: 'click', selector: '[data-zx-on-click="0"]' }],
            state_values: [() => {
                throw new Error('/Users/judahsullivan/private/boom');
            }],
            signals: []
        });

        let thrown = null;
        const onWindowError = (event) => {
            thrown = event.error;
            if (typeof event.preventDefault === 'function') {
                event.preventDefault();
            }
        };
        window.addEventListener('error', onWindowError);
        container.querySelector('button').click();
        window.removeEventListener('error', onWindowError);

        expect(thrown).toBeTruthy();
        expect(thrown.zenithRuntimeError).toBeTruthy();
        expect(thrown.zenithRuntimeError.kind).toBe('ZENITH_RUNTIME_ERROR');
        expect(thrown.zenithRuntimeError.phase).toBe('event');
        expect(thrown.zenithRuntimeError.code).toBe('EVENT_HANDLER_FAILED');
        expect(thrown.zenithRuntimeError.marker).toEqual({ type: 'data-zx-on-click', id: 0 });
        expect(thrown.zenithRuntimeError.message.includes('/Users/')).toBe(false);
    });

    test('registers a single document keydown listener for esc bindings', () => {
        let callsA = 0;
        let callsB = 0;
        container.innerHTML = [
            '<section data-zx-on-esc="0"><input data-a /></section>',
            '<section data-zx-on-esc="1"><input data-b /></section>',
        ].join('');

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [
                { marker_index: 0, state_index: 0 },
                { marker_index: 1, state_index: 1 },
            ],
            markers: [
                { index: 0, kind: 'event', selector: '[data-zx-on-esc="0"]' },
                { index: 1, kind: 'event', selector: '[data-zx-on-esc="1"]' },
            ],
            events: [
                { index: 0, event: 'esc', selector: '[data-zx-on-esc="0"]' },
                { index: 1, event: 'esc', selector: '[data-zx-on-esc="1"]' },
            ],
            state_values: [
                () => { callsA += 1; },
                () => { callsB += 1; },
            ],
            signals: []
        });

        expect(_getCounts().listeners).toBe(1);
        expect(callsA).toBe(0);
        expect(callsB).toBe(0);
    });

    test('esc dispatch prefers most-recent binding containing activeElement', () => {
        let callsA = 0;
        let callsB = 0;
        container.innerHTML = [
            '<section data-zx-on-esc="0"><input data-a /></section>',
            '<section data-zx-on-esc="1"><input data-b /></section>',
        ].join('');

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [
                { marker_index: 0, state_index: 0 },
                { marker_index: 1, state_index: 1 },
            ],
            markers: [
                { index: 0, kind: 'event', selector: '[data-zx-on-esc="0"]' },
                { index: 1, kind: 'event', selector: '[data-zx-on-esc="1"]' },
            ],
            events: [
                { index: 0, event: 'esc', selector: '[data-zx-on-esc="0"]' },
                { index: 1, event: 'esc', selector: '[data-zx-on-esc="1"]' },
            ],
            state_values: [
                () => { callsA += 1; },
                () => { callsB += 1; },
            ],
            signals: []
        });

        const inputA = container.querySelector('[data-a]');
        const inputB = container.querySelector('[data-b]');

        inputA.focus();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(callsA).toBe(1);
        expect(callsB).toBe(0);

        inputB.focus();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(callsA).toBe(1);
        expect(callsB).toBe(1);
    });

    test('esc dispatch falls back to most-recent connected binding when focus is body', () => {
        let callsA = 0;
        let callsB = 0;
        container.innerHTML = [
            '<section data-zx-on-esc="0"><input data-a /></section>',
            '<section data-zx-on-esc="1"><input data-b /></section>',
        ].join('');

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [
                { marker_index: 0, state_index: 0 },
                { marker_index: 1, state_index: 1 },
            ],
            markers: [
                { index: 0, kind: 'event', selector: '[data-zx-on-esc="0"]' },
                { index: 1, kind: 'event', selector: '[data-zx-on-esc="1"]' },
            ],
            events: [
                { index: 0, event: 'esc', selector: '[data-zx-on-esc="0"]' },
                { index: 1, event: 'esc', selector: '[data-zx-on-esc="1"]' },
            ],
            state_values: [
                () => { callsA += 1; },
                () => { callsB += 1; },
            ],
            signals: []
        });

        const inputA = container.querySelector('[data-a]');
        inputA.focus();
        inputA.blur();
        if (typeof document.body.focus === 'function') {
            document.body.focus();
        }

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(callsA).toBe(0);
        expect(callsB).toBe(1);
    });

    test('cleanup removes document esc listener', () => {
        container.innerHTML = '<section data-zx-on-esc="0"><input /></section>';

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [{ marker_index: 0, state_index: 0 }],
            markers: [{ index: 0, kind: 'event', selector: '[data-zx-on-esc="0"]' }],
            events: [{ index: 0, event: 'esc', selector: '[data-zx-on-esc="0"]' }],
            state_values: [() => {}],
            signals: []
        });

        expect(_getCounts().listeners).toBe(1);
        cleanup();
        expect(_getCounts().listeners).toBe(0);
    });
});
