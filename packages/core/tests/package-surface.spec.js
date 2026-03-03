import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST_ROOT = join(PACKAGE_ROOT, 'dist');
const PACKAGE_JSON = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'));

describe('core package surface', () => {
    test('exports map keys stay unchanged', () => {
        expect(Object.keys(PACKAGE_JSON.exports || {})).toEqual([
            '.',
            './config',
            './path',
            './order',
            './hash',
            './errors',
            './version',
            './guards',
            './schema',
            './core-template',
            './ir'
        ]);
    });

    test('build emits dist entry JS and declarations', () => {
        expect(existsSync(join(DIST_ROOT, 'index.js'))).toBe(true);
        expect(existsSync(join(DIST_ROOT, 'index.d.ts'))).toBe(true);
    });

    test('tarball excludes src files', () => {
        const result = spawnSync('npm', ['pack', '--dry-run', '--json', '.'], {
            cwd: PACKAGE_ROOT,
            encoding: 'utf8'
        });

        expect(result.status).toBe(0);
        const payload = JSON.parse(result.stdout);
        const files = Array.isArray(payload) && payload[0]?.files
            ? payload[0].files.map((entry) => entry.path)
            : [];

        expect(files).toContain('dist/index.js');
        expect(files).toContain('dist/index.d.ts');
        expect(files.some((filePath) => String(filePath).startsWith('src/'))).toBe(false);
    });
});
