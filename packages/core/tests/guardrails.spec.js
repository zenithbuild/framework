// ---------------------------------------------------------------------------
// guardrails.spec.js — Contract enforcement tests
// ---------------------------------------------------------------------------
// These tests scan the actual source code to enforce contract prohibitions.
// They run in CI to prevent drift.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '../src');
const srcFiles = fs.readdirSync(srcDir).filter((f) => f.endsWith('.ts'));

describe('Contract Guardrails', () => {
    test('no eval() or new Function in source', () => {
        for (const file of srcFiles) {
            // guards.js contains these as string literals in FORBIDDEN_PATTERNS
            if (file === 'guards.ts') continue;

            const source = fs.readFileSync(path.join(srcDir, file), 'utf8');
            expect(source.includes('eval(')).toBe(false);
            expect(source.includes('new Function(')).toBe(false);
            expect(source.includes('new Function (')).toBe(false);
        }
    });

    test('no browser globals in source', () => {
        for (const file of srcFiles) {
            const source = fs.readFileSync(path.join(srcDir, file), 'utf8');

            // Skip files that intentionally contain browser-global tokens in template strings.
            if (file === 'guards.ts' || file === 'core-template.ts') continue;

            // Check for browser global references (word boundary match)
            const windowRefs = source.match(/\bwindow\b/g) || [];
            const documentRefs = source.match(/\bdocument\b/g) || [];
            const navigatorRefs = source.match(/\bnavigator\b/g) || [];

            expect(windowRefs.length).toBe(0);
            expect(documentRefs.length).toBe(0);
            expect(navigatorRefs.length).toBe(0);
        }
    });

    test('no imports from other Zenith packages', () => {
        const forbidden = [
            '@zenithbuild/compiler',
            '@zenithbuild/bundler',
            '@zenithbuild/runtime',
            '@zenithbuild/router',
            '@zenithbuild/cli'
        ];

        for (const file of srcFiles) {
            const source = fs.readFileSync(path.join(srcDir, file), 'utf8');
            for (const pkg of forbidden) {
                expect(source.includes(pkg)).toBe(false);
            }
        }
    });

    test('all expected source files exist', () => {
            const expected = [
            'config.ts', 'path.ts', 'order.ts', 'hash.ts',
            'errors.ts', 'version.ts', 'guards.ts', 'schema.ts',
            'core-template.ts', 'index.ts'
        ];
        for (const file of expected) {
            expect(fs.existsSync(path.join(srcDir, file))).toBe(true);
        }
    });

    test('all functions are synchronous (except config.loadConfig)', () => {
        for (const file of srcFiles) {
            const source = fs.readFileSync(path.join(srcDir, file), 'utf8');

            // config.js is allowed one async function (loadConfig)
            if (file === 'config.ts') {
                const asyncCount = (source.match(/\basync\b/g) || []).length;
                expect(asyncCount).toBeLessThanOrEqual(1);
                continue;
            }

            // All other modules must be fully synchronous
            expect(source.includes('async ')).toBe(false);
        }
    });

    test('no mutable global state', () => {
        for (const file of srcFiles) {
            const source = fs.readFileSync(path.join(srcDir, file), 'utf8');

            // Should not use let at module level (only const)
            // Split by lines and check for unindented let declarations
            const lines = source.split('\n');
            for (const line of lines) {
                const trimmed = line.trimStart();
                // Module-level let (no leading whitespace)
                if (line === trimmed && trimmed.startsWith('let ')) {
                    throw new Error(`Mutable module-level state in ${file}: ${line}`);
                }
            }
        }
    });
});
