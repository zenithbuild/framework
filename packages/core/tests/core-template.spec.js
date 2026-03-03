import { coreModuleSource } from '../dist/core-template.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const goldenPath = path.join(__dirname, 'fixtures', 'core-template.golden.js');

describe('core template contract', () => {
    test('coreModuleSource is deterministic for identical input', () => {
        const runtimeImport = '/assets/runtime.11111111.js';
        const first = coreModuleSource(runtimeImport);
        const second = coreModuleSource(runtimeImport);
        expect(first).toBe(second);
    });

    test('coreModuleSource output is purity-clean', () => {
        const source = coreModuleSource('/assets/runtime.11111111.js');
        expect(source.includes('.zen')).toBe(false);
        expect(source.includes('zenith:')).toBe(false);
        expect(source.includes('fetch(')).toBe(false);
    });

    test('coreModuleSource output matches golden bytes', () => {
        const source = coreModuleSource('/assets/runtime.11111111.js');
        const golden = readFileSync(goldenPath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        expect(source).toBe(golden);
    });
});
