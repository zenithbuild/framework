import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { jest } from '@jest/globals';

import { cli } from '../dist/index.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

jest.setTimeout(120000);

describe('node adapter artifact portability', () => {
    let fixtureRoot;
    let relocatedRoot;
    let server;

    afterEach(async () => {
        if (server) {
            server.close();
            server = null;
        }
        if (fixtureRoot) {
            await rm(fixtureRoot, { recursive: true, force: true });
            fixtureRoot = null;
        }
        if (relocatedRoot) {
            await rm(relocatedRoot, { recursive: true, force: true });
            relocatedRoot = null;
        }
    });

    test('relocated output installs only declared dependencies and starts', async () => {
        fixtureRoot = join(
            tmpdir(),
            `zenith-node-portability-source-${Date.now()}-${Math.random().toString(36).slice(2)}`
        );
        relocatedRoot = join(
            tmpdir(),
            `zenith-node-portability-target-${Date.now()}-${Math.random().toString(36).slice(2)}`
        );
        await mkdir(join(fixtureRoot, 'pages'), { recursive: true });
        await writeFile(join(fixtureRoot, 'pages', 'index.zen'), '<main>Portable Node output</main>\n');
        await writeFile(
            join(fixtureRoot, 'zenith.config.js'),
            'module.exports = { target: "node", router: false };\n'
        );

        await cli(['build'], fixtureRoot);
        await cp(join(fixtureRoot, 'dist'), relocatedRoot, { recursive: true });

        const manifest = JSON.parse(await readFile(join(relocatedRoot, 'package.json'), 'utf8'));
        const cliManifest = JSON.parse(
            await readFile(new URL('../package.json', import.meta.url), 'utf8')
        );
        expect(manifest.dependencies).toEqual({ sharp: cliManifest.dependencies.sharp });

        const sharpRuntime = await readFile(
            join(relocatedRoot, 'server', 'images', 'sharp-runtime.js'),
            'utf8'
        );
        expect(sharpRuntime).toContain("await import('sharp')");
        expect(sharpRuntime).not.toMatch(/\bfile:/);

        const install = spawnSync('bun', ['install', '--frozen-lockfile'], {
            cwd: relocatedRoot,
            encoding: 'utf8'
        });
        if (install.status !== 0) {
            const firstInstall = spawnSync('bun', ['install'], {
                cwd: relocatedRoot,
                encoding: 'utf8'
            });
            expect(firstInstall.status).toBe(0);
            const frozenInstall = spawnSync('bun', ['install', '--frozen-lockfile'], {
                cwd: relocatedRoot,
                encoding: 'utf8'
            });
            expect(frozenInstall.status).toBe(0);
        }

        const entry = await import(pathToFileURL(join(relocatedRoot, 'index.js')).href);
        server = await entry.createNodeServer({ port: 0, host: '127.0.0.1' });
        const response = await fetch(`http://127.0.0.1:${server.port}/`);
        expect(response.status).toBe(200);
        expect(await response.text()).toContain('Portable Node output');
    });
});
