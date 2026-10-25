import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
    _applyMarkerValue,
    _coerceText as renderCoerceText,
    _createContextualFragment as renderCreateFragment
} from '../src/render.js';
import { _coerceText, _createContextualFragment } from '../src/render-utils.js';
import { coerceText, createFragmentRegion } from '../src/fragment-patch.js';
import { _coerceText as hydrateCoerceText, _createContextualFragment as hydrateCreateFragment } from '../src/hydrate.js';
import { runtimeModuleProfileSnapshot } from '../dist/template.js';

const HTML_FRAGMENT_BRAND = Symbol.for('zenith.html_fragment');

function htmlFragment(html) {
    return {
        __zenith_fragment: true,
        html,
        [HTML_FRAGMENT_BRAND]: true
    };
}

function runtimePayload(error) {
    return error && error.zenithRuntimeError ? error.zenithRuntimeError : null;
}

describe('render utility boundary', () => {
    test('shared helpers keep one function identity across render, hydrate, and fragment-patch', () => {
        expect(renderCoerceText).toBe(_coerceText);
        expect(hydrateCoerceText).toBe(_coerceText);
        expect(coerceText).toBe(_coerceText);
        expect(renderCreateFragment).toBe(_createContextualFragment);
        expect(hydrateCreateFragment).toBe(_createContextualFragment);
    });

    test('coerceText renders empty for nullish and boolean values and stringifies scalars', () => {
        expect(_coerceText(null, 'value')).toBe('');
        expect(_coerceText(undefined, 'value')).toBe('');
        expect(_coerceText(false, 'value')).toBe('');
        expect(_coerceText(true, 'value')).toBe('');
        expect(_coerceText(0, 'value')).toBe('0');
        expect(_coerceText('ok', 'value')).toBe('ok');
    });

    test('coerceText rejects functions and objects with the renderable-value error', () => {
        let thrown = null;
        try {
            _coerceText(() => {}, 'marker[0].text');
        } catch (error) {
            thrown = error;
        }
        expect(runtimePayload(thrown).code).toBe('NON_RENDERABLE_VALUE');
        expect(runtimePayload(thrown).phase).toBe('render');
        expect(runtimePayload(thrown).path).toBe('marker[0].text');
        expect(thrown.message).toContain('non-renderable function');

        expect(() => _coerceText({ id: 1 }, 'marker[1].text')).toThrow(/non-renderable object/);
    });

    test('createContextualFragment parses HTML in the parent document', () => {
        const parent = document.createElement('div');
        document.body.appendChild(parent);
        const fragment = _createContextualFragment(parent, '<span class="n">hi</span>');
        parent.appendChild(fragment);
        const span = parent.querySelector('span');
        expect(span.textContent).toBe('hi');
        expect(span.getAttribute('class')).toBe('n');
        parent.remove();
    });

    test('createContextualFragment fails when Range is unavailable', () => {
        const parent = document.createElement('div');
        const doc = parent.ownerDocument;
        const original = doc.createRange;
        doc.createRange = undefined;
        try {
            expect(() => _createContextualFragment(parent, '<span></span>')).toThrow(
                '[Zenith Runtime] comment placeholder HTML rendering requires Range#createContextualFragment'
            );
        } finally {
            doc.createRange = original;
        }
    });

    test('render and fragment-patch call sites keep the same DOM results', () => {
        const textHost = document.createElement('div');
        _applyMarkerValue([textHost], { kind: 'text', index: 0 }, 12);
        expect(textHost.textContent).toBe('12');

        const attrHost = document.createElement('button');
        _applyMarkerValue([attrHost], { kind: 'attr', index: 1, attr: 'disabled' }, true);
        expect(attrHost.hasAttribute('disabled')).toBe(true);

        const listHost = document.createElement('div');
        document.body.appendChild(listHost);
        const region = createFragmentRegion();
        region.mount([null, 0, 'ok', htmlFragment('<em>c</em>')], {
            parent: listHost,
            insertBefore: null,
            rootPath: 'boundary'
        });
        expect(listHost.innerHTML).toBe('0ok<em>c</em>');

        const commentHost = document.createElement('div');
        document.body.appendChild(commentHost);
        const anchor = document.createComment('zx:bind:0');
        commentHost.appendChild(anchor);
        _applyMarkerValue([anchor], { kind: 'text', index: 2 }, htmlFragment('<strong>z</strong>'));
        expect(commentHost.innerHTML).toBe('<!--zx:bind:0--><strong>z</strong><!--/ zx:bind:0-->');

        region.destroy();
        listHost.remove();
        commentHost.remove();
    });

    test('marker application still rejects non-renderable text values', () => {
        const host = document.createElement('div');
        let thrown = null;
        try {
            _applyMarkerValue([host], { kind: 'text', index: 4 }, { bad: true });
        } catch (error) {
            thrown = error;
        }
        expect(runtimePayload(thrown).code).toBe('NON_RENDERABLE_VALUE');
        expect(thrown.message).toContain('non-renderable object');
    });

    test('concatenated runtime templates contain each extracted helper once', async () => {
        const profiles = ['default', 'production-emitted', 'production-emitted-with-presence'];
        for (let i = 0; i < profiles.length; i++) {
            const snapshot = runtimeModuleProfileSnapshot(profiles[i]);
            const helpers = snapshot.contributors.filter((entry) => entry.sourceFile === 'render-utils.js');
            expect(helpers.length).toBe(1);
            expect(snapshot.source.match(/function _coerceText\(/g)).toHaveLength(1);
            expect(snapshot.source.match(/function _createContextualFragment\(/g)).toHaveLength(1);
            expect(snapshot.source.includes("export { _createContextualFragment, _coerceText } from './render-utils.js'")).toBe(false);
        }

        const snapshot = runtimeModuleProfileSnapshot('production-emitted');
        const directory = mkdtempSync(join(tmpdir(), 'zenith-render-utils-'));
        try {
            const file = join(directory, 'runtime.mjs');
            writeFileSync(file, snapshot.source);
            const emitted = await import(pathToFileURL(file).href);
            expect(emitted._coerceText).toBe(emitted.coerceText);
            expect(typeof emitted._createContextualFragment).toBe('function');
            expect(typeof emitted._applyMarkerValue).toBe('function');
            expect(typeof emitted.createFragmentRegion).toBe('function');

            const host = document.createElement('div');
            emitted._applyMarkerValue([host], { kind: 'text', index: 0 }, 'emitted');
            expect(host.textContent).toBe('emitted');
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });
});
