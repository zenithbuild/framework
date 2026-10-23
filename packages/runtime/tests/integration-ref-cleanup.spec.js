import { hydrate } from '../dist/hydrate.js';
import { cleanup } from '../dist/cleanup.js';
import { zenOn, zenWindow } from '../dist/index.js';

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

    test('hydrates compiler ref bindings before mount effects and clears refs on cleanup', () => {
        container.innerHTML = '<section data-zx-ref="0"></section>';
        const nodeRef = { current: null };

        const unmount = hydrate({
            ir_version: 1,
            root: container,
            expressions: [],
            markers: [],
            events: [],
            refs: [{ index: 0, state_index: 0, selector: '[data-zx-ref="0"]' }],
            state_values: [nodeRef],
            state_keys: ['nodeRef'],
            signals: []
        });

        expect(nodeRef.current).toBe(container.querySelector('[data-zx-ref="0"]'));
        unmount();
        expect(nodeRef.current).toBeNull();
    });

    test('zenMount ctx.cleanup exists (editor contract: snippets/docs claim it)', () => {
        container.innerHTML = '<section data-zx-ref="0"></section>';
        const nodeRef = { current: null };
        let cleanupExists = false;

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [],
            markers: [],
            events: [],
            refs: [{ index: 0, state_index: 0, selector: '[data-zx-ref="0"]' }],
            state_values: [nodeRef],
            state_keys: ['nodeRef'],
            signals: [],
            components: [{
                instance: 'c0',
                selector: '[data-zx-ref="0"]',
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
        container.innerHTML = '<section data-zx-ref="0">content</section>';
        const nodeRef = { current: null };
        let refReadyInMount = null;

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [],
            markers: [],
            events: [],
            refs: [{ index: 0, state_index: 0, selector: '[data-zx-ref="0"]' }],
            state_values: [nodeRef],
            state_keys: ['nodeRef'],
            signals: [],
            components: [{
                instance: 'c0',
                selector: '[data-zx-ref="0"]',
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
        expect(nodeRef.current).toBe(container.querySelector('[data-zx-ref="0"]'));
    });

    test('zenOn + zenMount cleanup: handler does not fire after unmount', () => {
        container.innerHTML = '<section data-zx-ref="0"></section>';
        const nodeRef = { current: null };
        let resizeCount = 0;

        const unmount = hydrate({
            ir_version: 1,
            root: container,
            expressions: [],
            markers: [],
            events: [],
            refs: [{ index: 0, state_index: 0, selector: '[data-zx-ref="0"]' }],
            state_values: [nodeRef],
            state_keys: ['nodeRef'],
            signals: [],
            components: [{
                instance: 'c0',
                selector: '[data-zx-ref="0"]',
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


});
