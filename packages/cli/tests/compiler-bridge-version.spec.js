import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const runner = fileURLToPath(new URL('../dist/compiler-bridge-runner.js', import.meta.url));

describe('compiler bridge version probe', () => {
    let root;
    let module;
    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'zenith-compiler-probe-'));
        mkdirSync(join(root, 'dist'));
        module = join(root, 'dist', 'index.js');
        writeFileSync(module, 'export function compile() { throw new Error("must not compile during probe"); }');
    });
    afterEach(() => rmSync(root, { recursive: true, force: true }));

    test.each(['0.8.0', '0.9.0-rc.1'])('reports the selected bridge package version %s without compiling', (version) => {
        writeFileSync(join(root, 'package.json'), JSON.stringify({ version, type: 'module' }));
        const result = spawnSync(process.execPath, [runner, '--bridge-module', module, '--version'], { encoding: 'utf8' });
        expect(result.status).toBe(0);
        expect(result.stdout).toBe(`zenith-compiler ${version}\n`);
        expect(result.stderr).toBe('');
    });

    test('missing or invalid package versions cannot pass the probe', () => {
        writeFileSync(join(root, 'package.json'), JSON.stringify({ version: 'not-a-release', type: 'module' }));
        const result = spawnSync(process.execPath, [runner, '--bridge-module', module, '--version'], { encoding: 'utf8' });
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('must declare a valid release version');
    });
});
