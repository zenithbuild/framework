import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

    test('runtime source removes legacy zenhtml plumbing', () => {
        const source = fs.readFileSync(
            path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/hydrate.js'),
            'utf8'
        );

        expect(source.includes('zenhtml:')).toBe(false);
        expect(source.includes('__ZENITH_INTERNAL_ZENHTML')).toBe(false);
        expect(source.includes('LEGACY_MARKUP_HELPER')).toBe(false);
    });

    test('runtime source gates raw HTML behind unsafeHTML', () => {
        const source = fs.readFileSync(
            path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/hydrate.js'),
            'utf8'
        );

        expect(source.includes("attrName.toLowerCase() === 'innerhtml'")).toBe(true);
        expect(source.includes('innerHTML bindings are forbidden in Zenith')).toBe(true);
        expect(source.includes("attrName.toLowerCase() === 'unsafehtml'")).toBe(true);
    });

});
