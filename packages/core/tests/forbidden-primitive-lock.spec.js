// ---------------------------------------------------------------------------
// forbidden-primitive-lock.spec.js — PHASE 4 Forbidden Primitive Lock
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '../src');

function stripStringsAndComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
        .replace(/`(?:\\[\s\S]|[^\\`])*`/g, '')
        .replace(/"(?:\\.|[^"\\])*"/g, '')
        .replace(/'(?:\\.|[^'\\])*'/g, '');
}

test('core contains no dynamic execution primitives', () => {
    const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.js'));
    for (const file of files) {
        const source = fs.readFileSync(path.join(srcDir, file), 'utf8');
        const stripped = stripStringsAndComments(source);
        expect(stripped.includes('eval(')).toBe(false);
        expect(stripped.includes('new Function(')).toBe(false);
        expect(stripped.includes('document.write(')).toBe(false);
        expect(stripped.includes('with(')).toBe(false);
    }
});
