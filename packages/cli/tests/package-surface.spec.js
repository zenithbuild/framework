import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST_ROOT = join(PACKAGE_ROOT, 'dist');
const PACKAGE_JSON = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'));
const STRAY_DEBUG_SCRIPT = 'debug-script.js';
const STRAY_BUN_EXEC = "~/.bun/bin/bun run build";

function listFiles(directory) {
    const entries = readdirSync(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const fullPath = join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...listFiles(fullPath));
            continue;
        }
        files.push(fullPath);
    }
    return files;
}

function publishedPackPaths() {
    const result = spawnSync('npm', ['pack', '--dry-run', '--json', '.'], {
        cwd: PACKAGE_ROOT,
        encoding: 'utf8'
    });
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    return Array.isArray(payload) && payload[0]?.files
        ? payload[0].files.map((entry) => entry.path)
        : [];
}

describe('cli package surface', () => {
    test('exports map keys stay unchanged', () => {
        expect(Object.keys(PACKAGE_JSON.exports || {})).toEqual(['.']);
    });

    test('package manifest does not claim the public zenith bin', () => {
        expect(PACKAGE_JSON.bin).toBeUndefined();
    });

    test('build emits dist entry JS and declarations', () => {
        expect(existsSync(join(DIST_ROOT, 'index.js'))).toBe(true);
        expect(existsSync(join(DIST_ROOT, 'index.d.ts'))).toBe(true);
        expect(existsSync(join(DIST_ROOT, 'framework-components', 'Image.zen'))).toBe(true);
        expect(PACKAGE_JSON.dependencies.sharp).toBeUndefined();
        expect(PACKAGE_JSON.dependencies['@zenithbuild/image']).toBeUndefined();
        expect(PACKAGE_JSON.optionalDependencies?.['@zenithbuild/image']).toBeUndefined();
        expect(readFileSync(join(DIST_ROOT, 'index.js'), 'utf8').startsWith('#!/usr/bin/env node')).toBe(true);
    });

    test('dependencies include @zenithbuild/bundler for platform binary transit', () => {
        const deps = PACKAGE_JSON.dependencies || {};
        expect(deps).toHaveProperty('@zenithbuild/compiler');
        expect(deps).toHaveProperty('@zenithbuild/bundler');
    });

    test('tarball excludes src files', () => {
        const files = publishedPackPaths();

        expect(files).toContain('dist/index.js');
        expect(files).toContain('dist/index.d.ts');
        expect(files.some((filePath) => String(filePath).startsWith('src/'))).toBe(false);
    });

    test('published package excludes stray debug-script.js', () => {
        expect(existsSync(join(PACKAGE_ROOT, 'src', STRAY_DEBUG_SCRIPT))).toBe(false);
        expect(existsSync(join(DIST_ROOT, STRAY_DEBUG_SCRIPT))).toBe(false);

        const distFiles = listFiles(DIST_ROOT);
        expect(distFiles.some((filePath) => filePath.endsWith(`/${STRAY_DEBUG_SCRIPT}`))).toBe(false);
        const strayExec = distFiles.filter((filePath) => readFileSync(filePath, 'utf8').includes(STRAY_BUN_EXEC));
        expect(strayExec).toEqual([]);

        const files = publishedPackPaths();
        expect(files.some((filePath) => String(filePath).endsWith(STRAY_DEBUG_SCRIPT))).toBe(false);
    });
});
