import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

function readJson(path) {
    return JSON.parse(readFileSync(resolve(REPO_ROOT, path), 'utf8'));
}

describe('Batch 12 plugin quarantine', () => {
    test('active public packages do not expose legacy plugin subpaths', () => {
        const packages = [
            'packages/compiler/package.json',
            'packages/bundler/package.json'
        ];

        for (const packagePath of packages) {
            const manifest = readJson(packagePath);
            const exportKeys = Object.keys(manifest.exports || {});

            expect(exportKeys).not.toContain('./plugins');
            expect(exportKeys).not.toContain('./registry');
            expect(exportKeys.join('\n')).not.toMatch(/_legacy_v1|plugin|registry/i);
        }
    });

    test('legacy compiler package is private and does not advertise plugin exports', () => {
        const manifest = readJson('packages/compiler/_legacy_v1/package.json');
        const exportKeys = Object.keys(manifest.exports || {});

        expect(manifest.private).toBe(true);
        expect(manifest.publishConfig).toBeUndefined();
        expect(manifest.description).toMatch(/Archived internal legacy compiler snapshot/);
        expect(exportKeys).not.toContain('./plugins');
        expect(exportKeys).not.toContain('./registry');
    });
});
