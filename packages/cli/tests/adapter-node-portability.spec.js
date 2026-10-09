import { spawn, spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import http from 'node:http';
import { once } from 'node:events';
import sharp from 'sharp';
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
    let imageOrigin;

    afterEach(async () => {
        if (server) {
            if (server.pid && server.exitCode === null && server.signalCode === null) {
                const exited = once(server, 'exit');
                server.kill();
                await exited;
            }
            server = null;
        }
        if (imageOrigin) {
            await new Promise((resolve) => imageOrigin.close(resolve));
            imageOrigin = null;
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

    test('relocated output installs independently and transforms images in Node', async () => {
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
            'module.exports = { target: "node", router: false, images: { remotePatterns: [{ protocol: "http", hostname: "127.0.0.1" }], dangerouslyAllowLocalNetwork: true, allowSvg: true } };\n'
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

        await rm(fixtureRoot, { recursive: true, force: true });
        fixtureRoot = null;
        server = spawn(process.execPath, ['index.js'], {
            cwd: relocatedRoot,
            env: { ...process.env, PORT: '0', HOST: '127.0.0.1', NODE_PATH: '' },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        const origin = await new Promise((resolve, reject) => {
            let output = '';
            let errors = '';
            const timer = setTimeout(() => reject(new Error(`Node startup timed out: ${errors}`)), 15000);
            server.stderr.on('data', (chunk) => { errors += chunk; });
            server.once('error', (error) => { clearTimeout(timer); reject(error); });
            server.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Node exited ${code}: ${errors}`)); });
            server.stdout.on('data', (chunk) => {
                output += chunk;
                const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
                if (match) { clearTimeout(timer); resolve(match[0]); }
            });
        });
        const response = await fetch(`${origin}/`);
        expect(response.status).toBe(200);
        expect(await response.text()).toContain('Portable Node output');

        const raster = await sharp({ create: { width: 40, height: 20, channels: 3, background: 'red' } }).png().toBuffer();
        const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="blue"/></svg>');
        let originRequests = 0;
        imageOrigin = http.createServer((req, res) => {
            originRequests += 1;
            res.setHeader('Content-Type', req.url === '/input.svg' ? 'image/svg+xml' : 'image/png');
            res.end(req.url === '/input.svg' ? svg : raster);
        });
        await new Promise((resolve) => imageOrigin.listen(0, '127.0.0.1', resolve));
        for (const file of ['input.png', 'input.svg']) {
            const remote = `http://127.0.0.1:${imageOrigin.address().port}/${file}`;
            const url = `${origin}/_zenith/image?url=${encodeURIComponent(remote)}&w=16&f=webp`;
            const transformed = await fetch(url);
            expect(transformed.status).toBe(200);
            expect(transformed.headers.get('content-type')).toBe('image/webp');
            const bytes = Buffer.from(await transformed.arrayBuffer());
            expect(await sharp(bytes).metadata()).toMatchObject({ width: 16, height: 8, format: 'webp' });
            const cached = await fetch(url);
            expect(cached.status).toBe(200);
            expect(Buffer.from(await cached.arrayBuffer())).toEqual(bytes);
            expect(originRequests).toBe(file === 'input.png' ? 1 : 2);
        }
    });
});
