import { hydrate } from '../dist/hydrate.js';
import { cleanup } from '../dist/cleanup.js';

describe('marker namespace separation', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        cleanup();
        document.body.removeChild(container);
    });

    test('hydrates same-node ref and attr markers when selectors use distinct namespaces', () => {
        container.innerHTML = [
            '<svg viewBox="0 0 100 100">',
            '  <circle data-zx-cx="0" cy="20" r="8"></circle>',
            '  <circle data-zx-ref="0" cx="50" cy="50" data-zx-r="1"></circle>',
            '</svg>'
        ].join('');

        const nodeRef = { current: null };

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [
                { marker_index: 0, literal: '40' },
                { marker_index: 1, literal: '20' }
            ],
            markers: [
                { index: 0, kind: 'attr', selector: '[data-zx-cx="0"]', attr: 'cx' },
                { index: 1, kind: 'attr', selector: '[data-zx-r="1"]', attr: 'r' }
            ],
            events: [],
            refs: [{ index: 0, state_index: 0, selector: '[data-zx-ref="0"]' }],
            state_values: [nodeRef],
            state_keys: ['nodeRef'],
            signals: []
        });

        const circles = container.querySelectorAll('circle');
        expect(circles[0].getAttribute('cx')).toBe('40');
        expect(circles[1].getAttribute('r')).toBe('20');
        expect(nodeRef.current).toBe(circles[1]);
        expect(container.querySelector('[data-zx-ref="0"]')).toBe(circles[1]);
        expect(container.querySelector('[data-zx-r="1"]')).toBe(circles[1]);
    });
});
