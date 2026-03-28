import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import { Compiler } from '@zenithbuild/compiler';

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const WORKSPACE_ROOT = resolve(PACKAGE_ROOT, '../..');
const EXAMPLES_DIR = join(WORKSPACE_ROOT, 'docs', 'documentation', 'examples');

test('all .zen examples in docs must compile cleanly (no false teaching surfaces)', () => {
    const examples = readdirSync(EXAMPLES_DIR).filter((file) => file.endsWith('.zen'));
    assert.ok(examples.length > 0, 'Should find at least one .zen example to compile');

    const compiler = new Compiler();

    for (const exampleFile of examples) {
        const filePath = join(EXAMPLES_DIR, exampleFile);
        const source = readFileSync(filePath, 'utf8');

        try {
            const result = compiler.compile(source, {
                filename: exampleFile,
                mode: 'client',
                generate_ssr: false
            });

            assert.ok(result, `Compiler returned no result for ${exampleFile}`);
            assert.ok(result.js, `Compiler returned no JS for ${exampleFile}`);
        } catch (err) {
            assert.fail(`Example ${exampleFile} failed to compile. Snippets must match canonical syntax.\nError: ${err.message}`);
        }
    }
});
