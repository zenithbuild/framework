import { test, expect } from '@jest/globals';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const WORKSPACE_ROOT = resolve(PACKAGE_ROOT, '../..');
const EXAMPLES_DIR = join(WORKSPACE_ROOT, 'docs', 'documentation', 'examples');

async function loadCompiler() {
    try {
        return await import('@zenithbuild/compiler');
    } catch {
        const fallbackPath = join(WORKSPACE_ROOT, 'packages', 'compiler', 'dist', 'index.js');
        return import(pathToFileURL(fallbackPath).href);
    }
}

test('all .zen examples in docs must compile cleanly (no false teaching surfaces)', async () => {
    const { compile } = await loadCompiler();
    const examples = readdirSync(EXAMPLES_DIR).filter((file) => file.endsWith('.zen'));
    expect(examples.length).toBeGreaterThan(0);

    for (const exampleFile of examples) {
        const filePath = join(EXAMPLES_DIR, exampleFile);
        const source = readFileSync(filePath, 'utf8');

        try {
            const result = compile(source, exampleFile);

            expect(result).toBeTruthy();
            expect(typeof result.html).toBe('string');
            expect(Array.isArray(result.diagnostics)).toBe(true);
            expect(Array.isArray(result.marker_bindings)).toBe(true);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(
                `Example ${exampleFile} failed to compile. Snippets must match canonical syntax.\nError: ${message}`
            );
        }
    }
});
