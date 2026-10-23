import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

describe('CLI source guardrails', () => {
    test('CLI source does not use forbidden execution primitives', () => {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const srcDir = path.resolve(__dirname, '../src');
        const files = fs.readdirSync(srcDir).filter((name) => name.endsWith('.js'));

        for (const file of files) {
            const source = fs.readFileSync(path.join(srcDir, file), 'utf8');
            expect(source.includes('eval(')).toBe(false);
            expect(source.includes('new Function')).toBe(false);
            expect(/\bFunction\(/.test(source)).toBe(false);
        }
    });

    test('CLI source does not reference window or document', () => {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const srcDir = path.resolve(__dirname, '../src');
        const files = fs.readdirSync(srcDir).filter((name) => name.endsWith('.js'));

        for (const file of files) {
            const source = fs.readFileSync(path.join(srcDir, file), 'utf8');

            // Allow HMR client script references if tests previously mocked it,
            // but we removed the HMR_CLIENT_SCRIPT constant.
            // Ignore generated browser snippets emitted as template strings.
            const withoutTemplateStrings = source.replace(/`[\s\S]*?`/g, '');

            // Check remaining source
            const windowRefs = withoutTemplateStrings.match(/\bwindow\b/g) || [];
            const documentRefs = withoutTemplateStrings.match(/\bdocument\b/g) || [];

            expect(windowRefs.length).toBe(0);
            expect(documentRefs.length).toBe(0);
        }
    });

    test('CLI source files exist with correct structure', () => {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const srcDir = path.resolve(__dirname, '../src');
        const expected = ['manifest.js', 'build.js', 'dev-server.js', 'preview.js', 'index.js'];

        for (const file of expected) {
            expect(fs.existsSync(path.join(srcDir, file))).toBe(true);
        }
    });
});
