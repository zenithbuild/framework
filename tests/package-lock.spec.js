// ---------------------------------------------------------------------------
// package-lock.spec.js — PHASE 8 Package.json Lock
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packagePath = path.resolve(__dirname, '../package.json');

test('package.json structure is locked', () => {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

    expect(pkg.type).toBe('module');
    expect(pkg.bin).toBeUndefined();

    const deps = pkg.dependencies || {};
    expect(Object.keys(deps)).toEqual([]);

    const scripts = pkg.scripts || {};
    expect(Object.keys(scripts).sort()).toEqual(['test']);

    const devDeps = Object.keys(pkg.devDependencies || {}).sort();
    expect(devDeps).toEqual(['@jest/globals', 'jest']);
});
