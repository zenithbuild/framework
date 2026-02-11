// ---------------------------------------------------------------------------
// file-structure-lock.spec.js — PHASE 9 File Structure Lock
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '../src');

test('core source file structure is frozen', () => {
    const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.js')).sort();
    expect(files).toEqual([
        'config.js',
        'errors.js',
        'guards.js',
        'hash.js',
        'index.js',
        'order.js',
        'path.js',
        'version.js'
    ]);
});
