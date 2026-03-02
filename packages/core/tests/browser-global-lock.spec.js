// ---------------------------------------------------------------------------
// browser-global-lock.spec.js — PHASE 3 Browser Global Lock
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

test('core contains no browser globals', () => {
    const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.js'));
    for (const file of files) {
        const source = fs.readFileSync(path.join(srcDir, file), 'utf8');
        const stripped = stripStringsAndComments(source);
        expect(stripped.includes('window.')).toBe(false);
        expect(stripped.includes('document.')).toBe(false);
        expect(stripped.includes('navigator.')).toBe(false);
        expect(stripped.includes('location.')).toBe(false);
        expect(stripped.includes('history.')).toBe(false);
    }
});
