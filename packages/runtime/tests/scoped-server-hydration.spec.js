import { hydrate } from '../dist/hydrate.js';
import { cleanup } from '../dist/cleanup.js';
import { signal } from '../dist/signal.js';

describe('scoped server data hydration', () => {
    const OVERLAY_ID = '__zenith_runtime_error_overlay';
    const LAYOUT_KEY = 'layout:src/layouts/DefaultLayout.zen';
    const SINGLETON_KEY = 'component:src/components/StatusCard.zen';
    const REPEATED_OWNER_KEY = 'component:src/components/Card.zen';
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
        if (container.parentNode) {
            document.body.removeChild(container);
        }
    });

    function hydrateText(expression, ssrData, html = '<p data-zx-e="0"></p>') {
        container.innerHTML = html;
        hydrate({
            ir_version: 1,
            root: container,
            expressions: Array.isArray(expression) ? expression : [expression],
            markers: (Array.isArray(expression) ? expression : [expression]).map((entry, index) => ({
                index,
                kind: 'text',
                selector: `[data-zx-e~="${index}"]`
            })),
            events: [],
            state_values: [],
            signals: [],
            ssr_data: ssrData
        });
    }

    function scopedEnvelope(route, scoped) {
        return { ...route, route, scoped };
    }

    test('legacy flat payload hydrates route expressions', () => {
        hydrateText({ marker_index: 0, literal: 'data.viewer' }, { viewer: 'Ada' });

        expect(container.querySelector('p').textContent).toBe('Ada');
    });

    test('legacy flat payload with app-owned route object remains flat', () => {
        hydrateText(
            { marker_index: 0, literal: 'data.viewer' },
            { viewer: 'Ada', route: { path: '/profile' } }
        );

        expect(container.querySelector('p').textContent).toBe('Ada');
    });

    test('legacy flat payload with app-owned route and scoped objects remains flat', () => {
        hydrateText(
            { marker_index: 0, literal: 'data.title' },
            { title: 'Legacy title', route: { path: '/profile' }, scoped: { panel: 'settings' } }
        );

        expect(container.querySelector('p').textContent).toBe('Legacy title');
    });

    test('generated scoped payload hydrates route expressions from flat payload fields', () => {
        hydrateText(
            { marker_index: 0, literal: 'data.viewer' },
            scopedEnvelope({ viewer: 'Route Ada' }, { [LAYOUT_KEY]: { viewer: 'Layout Ada' } })
        );

        expect(container.querySelector('p').textContent).toBe('Route Ada');
    });

    test('layout scoped key hydrates owner-local values', () => {
        hydrateText(
            { marker_index: 0, literal: 'data.navigation.title', scoped_data_key: LAYOUT_KEY },
            scopedEnvelope({}, { [LAYOUT_KEY]: { navigation: { title: 'Docs' } } })
        );

        expect(container.querySelector('p').textContent).toBe('Docs');
    });

    test('singleton component scoped key hydrates owner-local values', () => {
        hydrateText(
            { marker_index: 0, literal: 'data.status.label', scoped_data_key: SINGLETON_KEY },
            scopedEnvelope({}, { [SINGLETON_KEY]: { status: { label: 'Ready' } } })
        );

        expect(container.querySelector('p').textContent).toBe('Ready');
    });

    test('repeated component scoped keys hydrate distinct values', () => {
        hydrateText(
            [
                { marker_index: 0, literal: 'data.label', scoped_data_key: `${REPEATED_OWNER_KEY}:o0` },
                { marker_index: 1, literal: 'data.label', scoped_data_key: `${REPEATED_OWNER_KEY}:o1` }
            ],
            scopedEnvelope({}, {
                [`${REPEATED_OWNER_KEY}:o0`]: { label: 'First' },
                [`${REPEATED_OWNER_KEY}:o1`]: { label: 'Second' }
            }),
            '<p data-zx-e="0"></p><p data-zx-e="1"></p>'
        );

        expect(container.querySelector('[data-zx-e="0"]').textContent).toBe('First');
        expect(container.querySelector('[data-zx-e="1"]').textContent).toBe('Second');
    });

    test('route data and owner-local data do not collide', () => {
        hydrateText(
            [
                { marker_index: 0, literal: 'data.label' },
                { marker_index: 1, literal: 'data.label', scoped_data_key: SINGLETON_KEY }
            ],
            scopedEnvelope(
                { label: 'Route label' },
                { [SINGLETON_KEY]: { label: 'Scoped label' } }
            ),
            '<p data-zx-e="0"></p><p data-zx-e="1"></p>'
        );

        expect(container.querySelector('[data-zx-e="0"]').textContent).toBe('Route label');
        expect(container.querySelector('[data-zx-e="1"]').textContent).toBe('Scoped label');
    });

    test('missing scoped key fails clearly', () => {
        const missingKey = 'component:src/components/Missing.zen';
        const expectedMessage = `[Zenith:ScopedServerData] Missing scoped hydration payload for ${missingKey}`;

        expect(() => hydrateText(
            { marker_index: 0, literal: 'data.label', scoped_data_key: missingKey },
            scopedEnvelope({}, {})
        )).toThrow(expectedMessage);

        try {
            hydrateText(
                { marker_index: 0, literal: 'data.label', scoped_data_key: missingKey },
                scopedEnvelope({}, {})
            );
        } catch (error) {
            expect(error.cause.message).toBe(expectedMessage);
        }
    });

    test('signals, effects, and remounts reuse serialized scoped values without fetching', async () => {
        const originalFetch = globalThis.fetch;
        let fetchCalls = 0;
        globalThis.fetch = () => {
            fetchCalls += 1;
            throw new Error('unexpected scoped data fetch');
        };

        try {
            const isOpen = signal(false);
            let effectRuns = 0;
            container.innerHTML = '<Card data-zx-c="c0"><p data-zx-e="0"></p><span data-status>idle</span></Card>';

            hydrate({
                ir_version: 1,
                root: container,
                expressions: [{
                    marker_index: 0,
                    literal: 'data.label',
                    scoped_data_key: SINGLETON_KEY,
                    signal_indices: [0]
                }],
                markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
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
                                status.textContent = props.isOpen.get() ? 'open' : 'closed';
                            });
                        },
                        destroy() { },
                        bindings: Object.freeze({})
                    })
                }],
                ssr_data: scopedEnvelope({}, { [SINGLETON_KEY]: { label: 'Serialized' } })
            });

            await Promise.resolve();
            expect(container.querySelector('[data-zx-e="0"]').textContent).toBe('Serialized');
            expect(container.querySelector('[data-status]').textContent).toBe('closed');
            expect(fetchCalls).toBe(0);

            isOpen.set(true);
            await Promise.resolve();

            expect(container.querySelector('[data-zx-e="0"]').textContent).toBe('Serialized');
            expect(container.querySelector('[data-status]').textContent).toBe('open');
            expect(effectRuns).toBe(2);
            expect(fetchCalls).toBe(0);

            cleanup();
            container.innerHTML = '<p data-zx-e="0"></p>';
            hydrate({
                ir_version: 1,
                root: container,
                expressions: [{ marker_index: 0, literal: 'data.label', scoped_data_key: SINGLETON_KEY }],
                markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
                events: [],
                state_values: [],
                signals: [],
                ssr_data: scopedEnvelope({}, { [SINGLETON_KEY]: { label: 'Serialized' } })
            });

            expect(container.querySelector('p').textContent).toBe('Serialized');
            expect(fetchCalls).toBe(0);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('expr_fns continue receiving raw ssrData', () => {
        container.innerHTML = '<p data-zx-e="0"></p>';

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [{ marker_index: 0, fn_index: 0 }],
            markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
            events: [],
            state_values: [],
            signals: [],
            ssr_data: { title: 'Raw Title' },
            expr_fns: [({ ssrData }) => ssrData.title]
        });

        expect(container.querySelector('p').textContent).toBe('Raw Title');
    });
});
