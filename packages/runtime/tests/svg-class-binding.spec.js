import { hydrate } from '../dist/hydrate.js';
import { cleanup } from '../dist/cleanup.js';
import { signal } from '../dist/signal.js';

describe('runtime svg class binding', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        cleanup();
        document.body.removeChild(container);
    });

    function hydrateClassBinding(markup, selector, initialClass) {
        container.innerHTML = markup;
        const classSignal = signal(initialClass);
        let unmount = null;

        expect(() => {
            unmount = hydrate({
                ir_version: 1,
                root: container,
                expressions: [{ marker_index: 0, signal_index: 0 }],
                markers: [{ index: 0, kind: 'attr', selector, attr: 'class' }],
                events: [],
                state_values: [classSignal],
                signals: [{ id: 0, kind: 'signal', state_index: 0 }]
            });
        }).not.toThrow();

        return { classSignal, unmount };
    }

    test('keeps HTML class bindings working on initial bind and update', () => {
        const { classSignal, unmount } = hydrateClassBinding(
            '<div data-zx-class="0"></div>',
            '[data-zx-class="0"]',
            'plain-class'
        );

        const node = container.querySelector('div');
        expect(typeof unmount).toBe('function');
        expect(node.getAttribute('class')).toBe('plain-class');

        classSignal.set('plain-class active');
        expect(node.getAttribute('class')).toBe('plain-class active');
    });

    test('applies SVG circle class bindings without throwing', () => {
        const { classSignal } = hydrateClassBinding(
            '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="20" data-zx-class="0"></circle></svg>',
            '[data-zx-class="0"]',
            'fill-red'
        );

        const node = container.querySelector('circle');
        expect(node.getAttribute('class')).toBe('fill-red');

        classSignal.set('fill-blue');
        expect(node.getAttribute('class')).toBe('fill-blue');
    });

    test('applies SVG text class bindings without throwing', () => {
        const { classSignal } = hydrateClassBinding(
            '<svg viewBox="0 0 100 100"><text x="10" y="20" data-zx-class="0">Zenith</text></svg>',
            '[data-zx-class="0"]',
            'label-primary'
        );

        const node = container.querySelector('text');
        expect(node.getAttribute('class')).toBe('label-primary');

        classSignal.set('label-secondary');
        expect(node.getAttribute('class')).toBe('label-secondary');
    });
});
