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

    test('freezes hydration payload tables and nested descriptors', () => {
        container.innerHTML = '<Card data-zx-c="c0"><span data-zx-e="0"></span></Card>';
        const payload = {
            ir_version: 1,
            root: container,
            expressions: [{ marker_index: 0, component_instance: 'c0', component_binding: 'label' }],
            markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
            events: [],
            state_values: [],
            signals: [],
            components: [{
                instance: 'c0',
                selector: '[data-zx-c~="c0"]',
                props: [{ name: 'label', type: 'static', value: { text: 'ok' } }],
                create: (_host, props) => ({
                    mount() { },
                    destroy() { },
                    bindings: Object.freeze({ label: props.label.text })
                })
            }]
        };

        hydrate(payload);

        expect(Object.isFrozen(payload)).toBe(true);
        expect(Object.isFrozen(payload.expressions)).toBe(true);
        expect(Object.isFrozen(payload.expressions[0])).toBe(true);
        expect(Object.isFrozen(payload.markers)).toBe(true);
        expect(Object.isFrozen(payload.signals)).toBe(true);
        expect(Object.isFrozen(payload.components)).toBe(true);
        expect(Object.isFrozen(payload.components[0])).toBe(true);
        expect(Object.isFrozen(payload.components[0].props)).toBe(true);
        expect(Object.isFrozen(payload.components[0].props[0])).toBe(true);
        expect(Object.isFrozen(payload.components[0].props[0].value)).toBe(true);

        expect(() => {
            payload.expressions[0].marker_index = 1;
        }).toThrow(TypeError);
        expect(() => {
            payload.signals.push({ id: 0, kind: 'signal', state_index: 0 });
        }).toThrow(TypeError);
    });

    test('keeps ref-like state values writable after payload freeze', () => {
        container.innerHTML = '<div data-ref-node="yes"></div><p data-zx-e="0"></p>';
        const nodeRef = { current: null };
        const payload = {
            ir_version: 1,
            root: container,
            expressions: [{ marker_index: 0, literal: '"ok"' }],
            markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
            events: [],
            state_values: [nodeRef],
            signals: []
        };

        hydrate(payload);

        expect(Object.isFrozen(payload)).toBe(true);
        expect(Object.isFrozen(nodeRef)).toBe(false);
        const currentDescriptor = Object.getOwnPropertyDescriptor(nodeRef, 'current');
        expect(currentDescriptor && currentDescriptor.writable).toBe(true);

        const host = container.querySelector('[data-ref-node="yes"]');
        expect(() => {
            nodeRef.current = host;
        }).not.toThrow();
        expect(nodeRef.current).toBe(host);
    });

    test('keeps nested ref-like component prop values writable for mount wiring', () => {
        container.innerHTML = '<Card data-zx-c="c0"></Card>';
        const hostRef = { current: null };
        const mountCtx = { refs: { hostRef } };
        const payload = {
            ir_version: 1,
            root: container,
            expressions: [],
            markers: [],
            events: [],
            state_values: [],
            signals: [],
            components: [{
                instance: 'c0',
                selector: '[data-zx-c~="c0"]',
                props: [{ name: 'mountCtx', type: 'static', value: mountCtx }],
                create: (host, props) => ({
                    mount() {
                        props.mountCtx.refs.hostRef.current = host;
                    },
                    destroy() { },
                    bindings: Object.freeze({})
                })
            }]
        };

        hydrate(payload);

        expect(Object.isFrozen(payload.components[0].props[0].value)).toBe(true);
        expect(Object.isFrozen(hostRef)).toBe(false);
        const currentDescriptor = Object.getOwnPropertyDescriptor(hostRef, 'current');
        expect(currentDescriptor && currentDescriptor.writable).toBe(true);
        expect(hostRef.current).toBe(container.querySelector('[data-zx-c~="c0"]'));
    });

    test('does not freeze host objects in payload state values', () => {
        container.innerHTML = '<p data-zx-e="0"></p>';
        const requestUrl = new URL('https://zenith.dev/docs');
        const payload = {
            ir_version: 1,
            root: container,
            expressions: [{ marker_index: 0, literal: '"ok"' }],
            markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
            events: [],
            state_values: [requestUrl],
            signals: []
        };

        hydrate(payload);

        expect(Object.isFrozen(payload)).toBe(true);
        expect(Object.isFrozen(payload.state_values)).toBe(true);
        expect(Object.isFrozen(requestUrl)).toBe(false);
    });

    test('does not freeze function values in payload state values', () => {
        container.innerHTML = '<p data-zx-e="0"></p>';
        const handler = () => 'ok';
        const payload = {
            ir_version: 1,
            root: container,
            expressions: [{ marker_index: 0, literal: '"ok"' }],
            markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
            events: [],
            state_values: [handler],
            signals: []
        };

        hydrate(payload);

        expect(Object.isFrozen(payload)).toBe(true);
        expect(Object.isFrozen(payload.state_values)).toBe(true);
        expect(Object.isFrozen(handler)).toBe(false);
        expect(handler()).toBe('ok');
    });

    test('does not freeze ref-like objects nested in plain object and array containers', () => {
        container.innerHTML = '<div data-ref-node="yes"></div><p data-zx-e="0"></p>';
        const nestedRef = { current: null };
        const nestedContainer = { list: [nestedRef] };
        const payload = {
            ir_version: 1,
            root: container,
            expressions: [{ marker_index: 0, literal: '"ok"' }],
            markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
            events: [],
            state_values: [nestedContainer],
            signals: []
        };

        hydrate(payload);

        expect(Object.isFrozen(payload)).toBe(true);
        expect(Object.isFrozen(payload.state_values)).toBe(true);
        expect(Object.isFrozen(nestedContainer)).toBe(true);
        expect(Object.isFrozen(nestedContainer.list)).toBe(true);
        expect(Object.isFrozen(nestedRef)).toBe(false);

        const currentDescriptor = Object.getOwnPropertyDescriptor(nestedRef, 'current');
        expect(currentDescriptor && currentDescriptor.writable).toBe(true);

        const host = container.querySelector('[data-ref-node="yes"]');
        expect(() => {
            nestedRef.current = host;
        }).not.toThrow();
        expect(nestedRef.current).toBe(host);
    });


});
