import { existsSync, readFileSync } from 'node:fs';
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

    test('legacy compiler V1 package is removed from the repository surface', () => {
        expect(existsSync(resolve(REPO_ROOT, 'packages/compiler/_legacy_v1'))).toBe(false);
    });
});
