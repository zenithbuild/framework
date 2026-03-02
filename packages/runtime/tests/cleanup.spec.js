import { hydrate } from '../src/hydrate.js';
import { cleanup, _getCounts } from '../src/cleanup.js';

describe('cleanup()', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        cleanup();
        document.body.removeChild(container);
    });

    test('removes active event listeners deterministically', () => {
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

        expect(_getCounts().listeners).toBe(1);
        container.querySelector('button').click();
        expect(clicks).toBe(1);

        cleanup();
        expect(_getCounts().listeners).toBe(0);
        container.querySelector('button').click();
        expect(clicks).toBe(1);
    });

    test('is idempotent', () => {
        cleanup();
        cleanup();
        expect(_getCounts().listeners).toBe(0);
    });
});
