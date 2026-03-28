import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hydrate } from '../dist/hydrate.js';
import { cleanup } from '../dist/cleanup.js';

const OVERLAY_ID = '__zenith_runtime_error_overlay';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Track A runtime security regression gates', () => {
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
        if (container && container.parentNode) {
            container.parentNode.removeChild(container);
        }
    });

    test('ordinary bindings escape HTML by default', () => {
        container.innerHTML = '<section data-zx-e="0"></section>';

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [{ marker_index: 0, literal: '"<img src=x onerror=alert(1)>"' }],
            markers: [{ index: 0, kind: 'text', selector: '[data-zx-e~="0"]' }],
            events: [],
            state_values: [],
            signals: []
        });

        const section = container.querySelector('section');
        expect(section.textContent).toBe('<img src=x onerror=alert(1)>');
        expect(section.innerHTML).toBe('&lt;img src=x onerror=alert(1)&gt;');
    });

    test('implicit innerHTML bindings fail instead of becoming a silent HTML sink', () => {
        container.innerHTML = '<section data-zx-innerHTML="0"></section>';

        expect(() =>
            hydrate({
                ir_version: 1,
                root: container,
                expressions: [{ marker_index: 0, literal: '"<strong>unsafe</strong>"' }],
                markers: [{ index: 0, kind: 'attr', selector: '[data-zx-innerHTML="0"]', attr: 'innerHTML' }],
                events: [],
                state_values: [],
                signals: []
            })
        ).toThrow(/innerHTML bindings are forbidden/i);
    });

    test('unsafe HTML remains explicit-only through unsafeHTML', () => {
        container.innerHTML = '<section data-zx-unsafeHTML="0"></section>';

        hydrate({
            ir_version: 1,
            root: container,
            expressions: [{ marker_index: 0, literal: '"<strong>unsafe</strong>"' }],
            markers: [{ index: 0, kind: 'attr', selector: '[data-zx-unsafeHTML="0"]', attr: 'unsafeHTML' }],
            events: [],
            state_values: [],
            signals: []
        });

        expect(container.querySelector('section').innerHTML).toBe('<strong>unsafe</strong>');
    });

    test('runtime source and docs keep the raw HTML boundary explicit', () => {
        const hydrateSource = fs.readFileSync(path.resolve(__dirname, '../src/hydrate.js'), 'utf8');

        expect(hydrateSource.includes("attrName.toLowerCase() === 'innerhtml'")).toBe(true);
        expect(hydrateSource.includes('innerHTML bindings are forbidden in Zenith')).toBe(true);
        expect(hydrateSource.includes("attrName.toLowerCase() === 'unsafehtml'")).toBe(true);
        expect(hydrateSource.includes('zenhtml:')).toBe(false);
        expect(hydrateSource.includes('__ZENITH_INTERNAL_ZENHTML')).toBe(false);
    });
});
