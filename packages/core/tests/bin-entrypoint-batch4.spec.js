import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findPackageVersionForEntry } from '../bin/zenith-bin-utils.js';

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO_ROOT = path.resolve(PACKAGE_ROOT, '..', '..');
const CORE_PACKAGE = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));
const CLI_PACKAGE = JSON.parse(readFileSync(path.join(REPO_ROOT, 'packages/cli/package.json'), 'utf8'));

describe('Batch 4 core bin entrypoint integrity', () => {
    test('package version walk terminates safely on Windows paths', () => {
        const reads = [];
        const entryPath = 'C:\\app\\node_modules\\@zenithbuild\\cli\\dist\\index.js';
        const packagePath = 'C:\\app\\node_modules\\@zenithbuild\\cli\\package.json';

        const version = findPackageVersionForEntry(entryPath, '@zenithbuild/cli', {
            pathApi: path.win32,
            readFile(filePath) {
                reads.push(filePath);
                if (filePath === packagePath) {
                    return JSON.stringify({ name: '@zenithbuild/cli', version: '1.2.3' });
                }
                throw new Error('not found');
            }
        });

        expect(version).toBe('1.2.3');
        expect(reads).toContain(packagePath);
        expect(reads.length).toBeLessThan(8);
    });

    test('public zenith bin is owned by core only', () => {
        expect(CORE_PACKAGE.bin).toEqual({ zenith: 'bin/zenith.js' });
        expect(CLI_PACKAGE.bin).toBeUndefined();
    });

    test('core bin reports the framework version on POSIX hosts', () => {
        const result = spawnSync(process.execPath, [path.join(PACKAGE_ROOT, 'bin/zenith.js'), '--version'], {
            encoding: 'utf8'
        });

        expect(result.status).toBe(0);
        expect(result.stdout.trim()).toBe(`zenith ${CORE_PACKAGE.version}`);
    });
});
