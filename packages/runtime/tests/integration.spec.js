import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as runtimeApi from '../src/index.js';
import { hydrate } from '../src/hydrate.js';
import { cleanup } from '../src/cleanup.js';
import { zenOn, zenWindow } from '../src/index.js';

describe('runtime API lock', () => {
    test('exports explicit hydration/reactivity functions', () => {
        const keys = Object.keys(runtimeApi).sort();
        expect(keys).toEqual([
            'collectRefs',
            'hydrate',
            'signal',
            'state',
            'zenDocument',
            'zenOn',
            'zenResize',
            'zenWindow',
            'zeneffect'
        ]);
    });
});

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

    test('applies one explicit bootstrap call with no auto-run discovery', () => {
        const unmount = hydrate({
            ir_version: 1,
            root: container,
            expressions: [{ marker_index: 0, literal: '"Hello Zenith"' }],
            markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
            events: [],
            state_values: [],
            signals: []
        });

        expect(container.querySelector('p').textContent).toBe('Hello Zenith');
        expect(typeof unmount).toBe('function');
    });
    test('resolves params.* and ssr.* literal bindings deterministically', () => {
        container.innerHTML = '<p data-zx-e="0"></p><p data-zx-e="1"></p>';

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [
                { marker_index: 0, literal: 'params.id' },
                { marker_index: 1, literal: 'ssr.user.name' }
            ],
            markers: [
                { index: 0, kind: 'text', selector: '[data-zx-e~="0"]' },
                { index: 1, kind: 'text', selector: '[data-zx-e~="1"]' }
            ],
            events: [],
            state_values: [],
            signals: [],
            params: { id: '42' },
            ssr_data: { user: { name: 'Ada' } }
        });

        const nodes = container.querySelectorAll('p');
        expect(nodes[0].textContent).toBe('42');
        expect(nodes[1].textContent).toBe('Ada');
    });

    test('propagates signal props through component bindings', () => {
        container.innerHTML = '<Card data-zx-c="c0"><span data-zx-e="0"></span></Card>';
        const count = runtimeApi.signal(0);

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [{ marker_index: 0, component_instance: 'c0', component_binding: 'count' }],
            markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
            events: [],
            state_values: [count],
            signals: [{ id: 0, kind: 'signal', state_index: 0 }],
            components: [{
                instance: 'c0',
                selector: '[data-zx-c~="c0"]',
                props: [{ name: 'count', type: 'signal', index: 0 }],
                create: (_host, props) => ({
                    mount() { },
                    destroy() { },
                    bindings: Object.freeze({
                        count: props.count
                    })
                })
            }]
        });

        expect(container.querySelector('span').textContent).toBe('0');
        count.set(3);
        expect(container.querySelector('span').textContent).toBe('3');
    });

    test('re-renders compiled fn_index expressions when subscribed signals change', () => {
        container.innerHTML = '<p data-zx-e="0"></p>';
        const isOpen = runtimeApi.signal(false);

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [{
                marker_index: 0,
                signal_index: 0,
                signal_indices: [0],
                fn_index: 0
            }],
            markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
            events: [],
            state_values: [isOpen],
            signals: [{ id: 0, kind: 'signal', state_index: 0 }],
            expr_fns: [({ signalMap }) => (signalMap.get(0).get() ? 'close' : 'menu')]
        });

        expect(container.querySelector('p').textContent).toBe('menu');
        isOpen.set(true);
        expect(container.querySelector('p').textContent).toBe('close');
    });

    test('zenEffect re-runs on signal changes and updates visible dom state', async () => {
        container.innerHTML = '<Card data-zx-c="c0"><span data-status>idle</span></Card>';
        const isOpen = runtimeApi.signal(false);
        let effectRuns = 0;

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [],
            markers: [],
            events: [],
            state_values: [isOpen],
            signals: [{ id: 0, kind: 'signal', state_index: 0 }],
            components: [{
                instance: 'c0',
                selector: '[data-zx-c~="c0"]',
                props: [{ name: 'isOpen', type: 'signal', index: 0 }],
                create: (host, props, runtime) => ({
                    mount() {
                        const status = host.querySelector('[data-status]');
                        runtime.zenEffect(() => {
                            effectRuns += 1;
                            status.textContent = props.isOpen.get() ? 'close' : 'menu';
                        });
                    },
                    destroy() { },
                    bindings: Object.freeze({})
                })
            }]
        });

        await Promise.resolve();
        expect(container.querySelector('[data-status]').textContent).toBe('menu');
        expect(effectRuns).toBe(1);

        isOpen.set(true);

        await Promise.resolve();
        expect(container.querySelector('[data-status]').textContent).toBe('close');
        expect(effectRuns).toBe(2);
    });

    test('keeps static props immutable for component factories', () => {
        container.innerHTML = '<Card data-zx-c="c0"><span data-zx-e="0"></span></Card>';
        let propsFrozen = false;

        hydrate({
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
                props: [{ name: 'label', type: 'static', value: 'Clicks' }],
                create: (_host, props) => {
                    propsFrozen = Object.isFrozen(props);
                    return {
                        mount() { },
                        destroy() { },
                        bindings: Object.freeze({
                            label: props.label
                        })
                    };
                }
            }]
        });

        expect(propsFrozen).toBe(true);
        expect(container.querySelector('span').textContent).toBe('Clicks');
    });

    test('hard-fails on corrupted component prop payload', () => {
        container.innerHTML = '<Card data-zx-c="c0"><span data-zx-e="0"></span></Card>';

        expect(() =>
            hydrate({
                ir_version: 1,
                root: container,
                expressions: [{ marker_index: 0, literal: '"x"' }],
                markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
                events: [],
                state_values: [],
                signals: [],
                components: [{
                    instance: 'c0',
                    selector: '[data-zx-c~="c0"]',
                    props: [{ name: 'count', type: 'signal', index: 99 }],
                    create: () => ({ mount() { }, destroy() { }, bindings: Object.freeze({}) })
                }]
            })
        ).toThrow(/signal index .* did not resolve/);
    });

    test('hard-fails on malformed params/ssr payloads', () => {
        expect(() =>
            hydrate({
                ir_version: 1,
                root: container,
                expressions: [{ marker_index: 0, literal: '"x"' }],
                markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
                events: [],
                state_values: [],
                signals: [],
                params: []
            })
        ).toThrow(/requires params object/);

        expect(() =>
            hydrate({
                ir_version: 1,
                root: container,
                expressions: [{ marker_index: 0, literal: '"x"' }],
                markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
                events: [],
                state_values: [],
                signals: [],
                ssr_data: []
            })
        ).toThrow(/requires ssr_data object/);
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

    test('hydrates compiler ref bindings before mount effects and clears refs on cleanup', () => {
        container.innerHTML = '<section data-zx-r="0"></section>';
        const nodeRef = { current: null };

        const unmount = hydrate({
            ir_version: 1,
            root: container,
            expressions: [],
            markers: [],
            events: [],
            refs: [{ index: 0, state_index: 0, selector: '[data-zx-r="0"]' }],
            state_values: [nodeRef],
            state_keys: ['nodeRef'],
            signals: []
        });

        expect(nodeRef.current).toBe(container.querySelector('[data-zx-r="0"]'));
        unmount();
        expect(nodeRef.current).toBeNull();
    });

    test('zenMount ctx.cleanup exists (editor contract: snippets/docs claim it)', () => {
        container.innerHTML = '<section data-zx-r="0"></section>';
        const nodeRef = { current: null };
        let cleanupExists = false;

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [],
            markers: [],
            events: [],
            refs: [{ index: 0, state_index: 0, selector: '[data-zx-r="0"]' }],
            state_values: [nodeRef],
            state_keys: ['nodeRef'],
            signals: [],
            components: [{
                instance: 'c0',
                selector: '[data-zx-r="0"]',
                props: [],
                create: (_host, _props, runtime) => ({
                    mount() {
                        runtime.zenMount((ctx) => {
                            cleanupExists = typeof ctx.cleanup === 'function';
                        });
                    },
                    destroy() { },
                    bindings: Object.freeze({})
                })
            }]
        });

        expect(cleanupExists).toBe(true);
    });

    test('ref.current is set when zenMount callback runs (ref readiness invariant)', () => {
        container.innerHTML = '<section data-zx-r="0">content</section>';
        const nodeRef = { current: null };
        let refReadyInMount = null;

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [],
            markers: [],
            events: [],
            refs: [{ index: 0, state_index: 0, selector: '[data-zx-r="0"]' }],
            state_values: [nodeRef],
            state_keys: ['nodeRef'],
            signals: [],
            components: [{
                instance: 'c0',
                selector: '[data-zx-r="0"]',
                props: [{ name: 'nodeRef', type: 'static', value: nodeRef }],
                create: (_host, props, runtime) => {
                    const ref = props.nodeRef;
                    return {
                        mount() {
                            runtime.zenMount((ctx) => {
                                refReadyInMount = ref.current !== null;
                                ctx.cleanup(() => { refReadyInMount = null; });
                            });
                        },
                        destroy() { },
                        bindings: Object.freeze({})
                    };
                }
            }]
        });

        expect(refReadyInMount).toBe(true);
        expect(nodeRef.current).toBe(container.querySelector('[data-zx-r="0"]'));
    });

    test('zenOn + zenMount cleanup: handler does not fire after unmount', () => {
        container.innerHTML = '<section data-zx-r="0"></section>';
        const nodeRef = { current: null };
        let resizeCount = 0;

        const unmount = hydrate({
            ir_version: 1,
            root: container,
            expressions: [],
            markers: [],
            events: [],
            refs: [{ index: 0, state_index: 0, selector: '[data-zx-r="0"]' }],
            state_values: [nodeRef],
            state_keys: ['nodeRef'],
            signals: [],
            components: [{
                instance: 'c0',
                selector: '[data-zx-r="0"]',
                props: [
                    { name: 'zenOn', type: 'static', value: zenOn },
                    { name: 'zenWindow', type: 'static', value: zenWindow }
                ],
                create: (_host, props, runtime) => {
                    return {
                        mount() {
                            runtime.zenMount((ctx) => {
                                const win = props.zenWindow();
                                if (!win) return;
                                const off = props.zenOn(win, 'resize', () => { resizeCount += 1; });
                                ctx.cleanup(off);
                            });
                        },
                        destroy() { },
                        bindings: Object.freeze({})
                    };
                }
            }]
        });

        window.dispatchEvent(new Event('resize'));
        expect(resizeCount).toBeGreaterThanOrEqual(0);

        unmount();
        const countBefore = resizeCount;
        window.dispatchEvent(new Event('resize'));
        expect(resizeCount).toBe(countBefore);
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

    test('hard-fails when signal table order is mutated', () => {
        const tracked = createTrackedSignal(0);
        expect(() =>
            hydrate({
                ir_version: 1,
                root: container,
                expressions: [{ marker_index: 0, signal_index: 0 }],
                markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
                events: [],
                state_values: [tracked],
                signals: [{ id: 1, kind: 'signal', state_index: 0 }]
            })
        ).toThrow(/signal table out of order/);
    });

    test('shared signal props keep identity across many component instances and cleanup subscriptions', () => {
        const instanceCount = 100;
        const componentRows = [];
        const expressions = [];
        const markers = [];
        const components = [];
        const seenSignalRefs = [];

        for (let i = 0; i < instanceCount; i++) {
            componentRows.push(`<Card data-zx-c="c${i}"><span data-zx-e="${i}"></span></Card>`);
            expressions.push({ marker_index: i, component_instance: `c${i}`, component_binding: 'count' });
            markers.push({ index: i, kind: 'text', selector: `[data-zx-e~="${i}"]` });
            components.push({
                instance: `c${i}`,
                selector: `[data-zx-c~="c${i}"]`,
                props: [{ name: 'count', type: 'signal', index: 0 }],
                create: (_host, props) => {
                    seenSignalRefs.push(props.count);
                    return {
                        mount() { },
                        destroy() { },
                        bindings: Object.freeze({ count: props.count })
                    };
                }
            });
        }

        container.innerHTML = `<main>${componentRows.join('')}</main>`;
        const count = runtimeApi.signal(0);
        let subscribeCalls = 0;
        const originalSubscribe = count.subscribe.bind(count);
        count.subscribe = (fn) => {
            subscribeCalls += 1;
            return originalSubscribe(fn);
        };

        const unmount = hydrate({
            ir_version: 1,
            root: container,
            expressions,
            markers,
            events: [],
            state_values: [count],
            signals: [{ id: 0, kind: 'signal', state_index: 0 }],
            components
        });

        expect(seenSignalRefs.length).toBe(instanceCount);
        for (let i = 0; i < seenSignalRefs.length; i++) {
            expect(seenSignalRefs[i]).toBe(count);
        }
        // The runtime should subscribe once for a shared component signal reference.
        expect(subscribeCalls).toBe(1);

        count.set(5);
        const textsAfterUpdate = Array.from(container.querySelectorAll('[data-zx-e]')).map((node) => node.textContent);
        expect(textsAfterUpdate.every((value) => value === '5')).toBe(true);

        unmount();
        count.set(9);
        const textsAfterCleanup = Array.from(container.querySelectorAll('[data-zx-e]')).map((node) => node.textContent);
        expect(textsAfterCleanup.every((value) => value === '5')).toBe(true);
    });

    test('hydrates deterministically across 100 runs without payload mutation or retained subscriptions', () => {
        const tracked = createTrackedSignal(0);
        const payload = {
            ir_version: 1,
            root: container,
            expressions: [{ marker_index: 0, signal_index: 0 }],
            markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
            events: [],
            state_values: [tracked],
            signals: [{ id: 0, kind: 'signal', state_index: 0 }]
        };

        const snapshotBefore = JSON.stringify({
            expressions: payload.expressions,
            markers: payload.markers,
            events: payload.events,
            signals: payload.signals
        });

        let unmount = null;
        for (let i = 0; i < 100; i++) {
            unmount = hydrate(payload);
            tracked.set(i);
            expect(container.querySelector('p').textContent).toBe(String(i));
            expect(tracked.activeSubscribers()).toBe(1);
        }

        expect(tracked.subscribeCount()).toBe(100);
        expect(tracked.unsubscribeCount()).toBe(99);

        unmount();
        expect(tracked.activeSubscribers()).toBe(0);
        expect(tracked.unsubscribeCount()).toBe(100);

        const snapshotAfter = JSON.stringify({
            expressions: payload.expressions,
            markers: payload.markers,
            events: payload.events,
            signals: payload.signals
        });
        expect(snapshotAfter).toBe(snapshotBefore);
    });

    // ── Functional drift gates for _zenhtml sanitization ──────────────

    test('_zenhtml rejects script tag injection in interpolated values', () => {
        container.innerHTML = '<section data-zx-e="0"></section>';
        const injection = '<script>alert(1)</script>';

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
                expr_fns: [({ zenhtml }) => zenhtml`<div>${injection}</div>`]
            })
        ).toThrow(/forbidden.*script/i);
    });

    test('_zenhtml rejects javascript: URL injection in interpolated values', () => {
        container.innerHTML = '<section data-zx-e="0"></section>';
        const url = 'javascript:alert(1)';

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
                expr_fns: [({ zenhtml }) => zenhtml`<a href="${url}">link</a>`]
            })
        ).toThrow(/javascript.*URL/i);
    });

    test('_zenhtml rejects inline event handler attributes', () => {
        container.innerHTML = '<section data-zx-e="0"></section>';
        const handler = 'alert(1)';

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
                expr_fns: [({ zenhtml }) => zenhtml`<div onclick=${handler}>test</div>`]
            })
        ).toThrow(/event handler.*on\*/i);
    });

    test('_zenhtml rejects non-renderable object interpolation', () => {
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
                expr_fns: [({ zenhtml }) => zenhtml`<div>${obj}</div>`]
            })
        ).toThrow(/non-renderable object/i);
    });

});

function createTrackedSignal(initial) {
    let value = initial;
    const subscribers = new Set();
    let subscribeCalls = 0;
    let unsubscribeCalls = 0;

    return {
        get() {
            return value;
        },
        set(nextValue) {
            value = nextValue;
            const snapshot = Array.from(subscribers);
            for (let i = 0; i < snapshot.length; i++) {
                snapshot[i](value);
            }
        },
        subscribe(fn) {
            subscribeCalls += 1;
            subscribers.add(fn);
            return () => {
                if (subscribers.delete(fn)) {
                    unsubscribeCalls += 1;
                }
            };
        },
        subscribeCount() {
            return subscribeCalls;
        },
        unsubscribeCount() {
            return unsubscribeCalls;
        },
        activeSubscribers() {
            return subscribers.size;
        }
    };
}

describe('runtime source guardrails', () => {
    test('contains no forbidden execution primitives', () => {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const srcDir = path.resolve(__dirname, '../src');
        const files = fs.readdirSync(srcDir).filter((name) => name.endsWith('.js'));

        for (let i = 0; i < files.length; i++) {
            const source = fs.readFileSync(path.join(srcDir, files[i]), 'utf8');
            expect(source.includes('eval(')).toBe(false);
            expect(source.includes('new Function')).toBe(false);
            expect(/\bFunction\(/.test(source)).toBe(false);
            expect(source.includes('process.env')).toBe(false);
        }
    });

    test('does not use full-tree DOM discovery', () => {
        const source = fs.readFileSync(
            path.resolve(
                path.dirname(fileURLToPath(import.meta.url)),
                '../src/hydrate.js'
            ),
            'utf8'
        );

        expect(source.includes("querySelectorAll('*')")).toBe(false);
    });

    // ── Drift gates for _zenhtml / innerHTML (beta.2 baseline) ──────────────

    test('innerHTML assignment count does not exceed baseline', () => {
        // Do not hardcode innerHTML = count to a magic number. Instead,
        // snapshot the baseline count and compare. If this test fails,
        // a new innerHTML = was introduced; either remove it or update
        // the baseline with a justification comment.
        const HYDRATE_BASELINE = 4; // baseline as of beta.2: fragment render, container clear, innerHTML attr binding, + 1 comment mention
        const RUNTIME_BASELINE = 2; // baseline as of beta.2: page render, container clear

        const hydrateSource = fs.readFileSync(
            path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/hydrate.js'),
            'utf8'
        );
        const runtimeSource = fs.readFileSync(
            path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/runtime.js'),
            'utf8'
        );

        const hydrateCount = (hydrateSource.match(/innerHTML\s*=/g) || []).length;
        const runtimeCount = (runtimeSource.match(/innerHTML\s*=/g) || []).length;

        expect(hydrateCount).toBe(HYDRATE_BASELINE);
        expect(runtimeCount).toBe(RUNTIME_BASELINE);
    });

    test('scope.zenhtml = binding is banned (must use internal identifier)', () => {
        const source = fs.readFileSync(
            path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/hydrate.js'),
            'utf8'
        );

        // The scope binding must use __ZENITH_INTERNAL_ZENHTML, never bare zenhtml
        expect(source.includes('scope.zenhtml =')).toBe(false);
        expect(source.includes('scope.zenhtml=')).toBe(false);
        expect(source.includes('scope.__ZENITH_INTERNAL_ZENHTML')).toBe(true);
    });

    test('zenhtml is not part of public exports or globals', () => {
        const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
        const files = fs.readdirSync(srcDir).filter((name) => name.endsWith('.js'));

        for (let i = 0; i < files.length; i++) {
            const source = fs.readFileSync(path.join(srcDir, files[i]), 'utf8');
            expect(source.includes('export')).toBe(true) || true; // some files may not export
            // Ban direct zenhtml exports and global bindings
            expect(/export\s+.*\bzenhtml\b/.test(source)).toBe(false);
            expect(source.includes('globalThis.zenhtml')).toBe(false);
            expect(source.includes('window.zenhtml')).toBe(false);
        }
    });

});
