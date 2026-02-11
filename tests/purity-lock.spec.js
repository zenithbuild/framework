// ---------------------------------------------------------------------------
// purity-lock.spec.js — PHASE 7 Purity Lock
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '../src');

test('no async function declarations outside config.js', () => {
    const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.js'));
    for (const file of files) {
        const source = fs.readFileSync(path.join(srcDir, file), 'utf8');
        const hasAsyncFunction = /\basync\s+function\b/.test(source);
        if (file === 'config.js') {
            continue;
        }
        expect(hasAsyncFunction).toBe(false);
    }
});
