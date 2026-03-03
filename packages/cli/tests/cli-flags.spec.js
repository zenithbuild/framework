import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI_ENTRY = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const CLI_PACKAGE_JSON = resolve(fileURLToPath(new URL('..', import.meta.url)), 'package.json');
const CLI_VERSION = JSON.parse(readFileSync(CLI_PACKAGE_JSON, 'utf8')).version;

describe('cli global flags', () => {
    test('--help exits 0 and prints usage', () => {
        const result = spawnSync(process.execPath, [CLI_ENTRY, '--help'], {
            encoding: 'utf8',
            env: {
                ...process.env,
                ZENITH_NO_UI: '1',
                NO_COLOR: '1',
                CI: '1'
            }
        });

        expect(result.status).toBe(0);
        const output = `${result.stdout}${result.stderr}`.replace(/\r/g, '');
        expect(output).toContain('Usage:');
        expect(output).toContain('zenith build');
        expect(output).toContain('Options:');
    });

    test('--version exits 0 and prints the CLI version', () => {
        const result = spawnSync(process.execPath, [CLI_ENTRY, '--version'], {
            encoding: 'utf8',
            env: {
                ...process.env,
                ZENITH_NO_UI: '1',
                NO_COLOR: '1',
                CI: '1'
            }
        });

        expect(result.status).toBe(0);
        expect(result.stdout.trim()).toBe(`zenith ${CLI_VERSION}`);
    });
});
