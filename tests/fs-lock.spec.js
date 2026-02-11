// ---------------------------------------------------------------------------
// fs-lock.spec.js — PHASE 6 No FS Outside Config
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '../src');
const forbidden = ['fs.', 'readFile', 'writeFile', 'readdir'];

test('filesystem operations are only allowed in config.js', () => {
    const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.js'));
    for (const file of files) {
        if (file === 'config.js') continue;
        const source = fs.readFileSync(path.join(srcDir, file), 'utf8');
        for (const token of forbidden) {
            expect(source.includes(token)).toBe(false);
        }
    }
});
