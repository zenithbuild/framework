import { hydrate } from '../dist/hydrate.js';
import { cleanup } from '../dist/cleanup.js';
import { signal } from '../dist/signal.js';

describe('comment-backed text markers', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        cleanup();
        document.body.removeChild(container);
    });

    test('hydrates comment markers without clobbering sibling elements', () => {
        container.innerHTML = '<p><!--zx-e:0--><code data-zx-e="1"></code><!--zx-e:2--></p>';

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [
                { marker_index: 0, literal: '"Prefix "' },
                { marker_index: 1, literal: '"CODE"' },
                { marker_index: 2, literal: '" Suffix"' }
            ],
            markers: [
                { index: 0, kind: 'text', selector: 'comment:zx-e:0' },
                { index: 1, kind: 'text', selector: '[data-zx-e~="1"]' },
                { index: 2, kind: 'text', selector: 'comment:zx-e:2' }
            ],
            events: [],
            state_values: [],
            signals: []
        });

        expect(container.querySelector('p').textContent).toBe('Prefix CODE Suffix');
        expect(container.querySelector('code').textContent).toBe('CODE');
    });

    test('updates option text through comment markers', () => {
        container.innerHTML = '<select><option>Prefix <!--zx-e:0--></option></select>';
        const label = signal('One');

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [{ marker_index: 0, signal_index: 0 }],
            markers: [{ index: 0, kind: 'text', selector: 'comment:zx-e:0' }],
            events: [],
            state_values: [label],
            signals: [{ id: 0, kind: 'signal', state_index: 0 }]
        });

        const option = container.querySelector('option');
        expect(option.textContent).toBe('Prefix One');

        label.set('Two');
        expect(option.textContent).toBe('Prefix Two');
    });
});
