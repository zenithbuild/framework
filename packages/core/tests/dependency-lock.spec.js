// ---------------------------------------------------------------------------
// dependency-lock.spec.js — PHASE 2 Zero Dependency Enforcement
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '../src');

test('no zenith package imports', () => {
    const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.js'));
    for (const file of files) {
        const source = fs.readFileSync(path.join(srcDir, file), 'utf8');
        expect(source.includes('@zenithbuild/')).toBe(false);
    }
});
