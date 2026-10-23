import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('bundler stdin transport (CLI seam)', () => {
    test('runBundler serializes the full envelope and optional image runtime payload without stripping image_materialization', () => {
        const source = fs.readFileSync(
            path.resolve(__dirname, '../src/build/compiler-runtime.js'),
            'utf8'
        );
        expect(source).not.toMatch(/key\s*===\s*['"]image_materialization['"]\s*\?\s*undefined/);
        expect(source).toContain('JSON.stringify(bundlerPayload)');
        expect(source).toContain('image_runtime_payload: bundlerOptions.imageRuntimePayload');
        expect(source).toContain('inputs: Array.isArray(envelope) ? envelope : [envelope]');
    });
});
