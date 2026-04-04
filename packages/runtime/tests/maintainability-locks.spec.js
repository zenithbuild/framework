import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_DIR = path.resolve(__dirname, '../src');
const HYDRATION_RUNTIME_FILES = [
    'events.js',
    'expressions.js',
    'fragment-patch.js',
    'hydrate.js',
    'markup.js',
    'payload.js',
    'render.js',
    'scanner.js',
    'template-parser.js',
    'template.js'
];

function readSource(fileName) {
    return fs.readFileSync(path.join(SRC_DIR, fileName), 'utf8');
}

describe('Track E maintainability locks', () => {
    test('hydrate.js delegates scanner, event, and render responsibilities', () => {
        const hydrateSource = readSource('hydrate.js');

        expect(hydrateSource).toContain("from './scanner.js'");
        expect(hydrateSource).toContain("from './events.js'");
        expect(hydrateSource).toContain("from './render.js'");
        expect(hydrateSource).not.toContain('createTreeWalker(');
        expect(hydrateSource).not.toContain('function _buildCommentCache(');
        expect(hydrateSource).not.toContain('function _lookupCommentNodes(');
        expect(hydrateSource).not.toContain('function _applyMarkerValue(');
        expect(hydrateSource).not.toContain('function _applyAttribute(');
        expect(hydrateSource).not.toContain('.addEventListener(');
    });

    test('markup parsing lives in template-parser.js and is no longer duplicated in markup.js', () => {
        const markupSource = readSource('markup.js');
        const parserSource = readSource('template-parser.js');

        expect(markupSource).toContain("from './template-parser.js'");
        expect(markupSource).not.toContain('function _readMarkupLiteral(');
        expect(markupSource).not.toContain('function _markupLiteralToTemplate(');
        expect(parserSource).toContain('export function _rewriteMarkupLiterals');
        expect(parserSource).toContain('function _readMarkupLiteral(');
    });

    test('fragment rendering utilities no longer duplicate through hydrate.js', () => {
        const fragmentSource = readSource('fragment-patch.js');

        expect(fragmentSource).toContain("from './render.js'");
        expect(fragmentSource).not.toContain("from './hydrate.js'");
        expect(fragmentSource).not.toContain('export function coerceText(');
    });

    test('runtime template bundle includes extracted hydration modules', () => {
        const templateSource = `${readSource('template.js')}\n${readSource('runtime-template-profile.js')}`;

        for (let i = 0; i < HYDRATION_RUNTIME_FILES.length - 1; i++) {
            expect(templateSource).toContain(`'${HYDRATION_RUNTIME_FILES[i]}'`);
        }
    });

    test('Track E hydration files stay within the 500 line ceiling', () => {
        for (let i = 0; i < HYDRATION_RUNTIME_FILES.length; i++) {
            const fileName = HYDRATION_RUNTIME_FILES[i];
            const lineCount = readSource(fileName).split(/\r?\n/).length;
            expect(lineCount).toBeLessThanOrEqual(500);
        }
    });
});
