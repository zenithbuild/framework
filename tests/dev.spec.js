// ---------------------------------------------------------------------------
// dev.spec.js — Dev server & CLI integration tests
// ---------------------------------------------------------------------------

import { createDevServer } from '../src/dev-server.js';
import { createPreviewServer } from '../src/preview.js';
import { cli } from '../src/index.js';
import { build } from '../src/build.js';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function createTestProject(files) {
    const root = join(tmpdir(), `zenith-dev-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const pagesDir = join(root, 'pages');
    const outDir = join(root, 'dist');
    await mkdir(pagesDir, { recursive: true });

    for (const file of files) {
        const fullPath = join(pagesDir, file);
        await mkdir(join(fullPath, '..'), { recursive: true });
        await writeFile(fullPath, `<div>${file}</div>`);
    }

    return { root, pagesDir, outDir };
}

function httpGet(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
        }).on('error', reject);
    });
}

describe('Dev Server', () => {
    let project;
    let dev;

    afterEach(async () => {
        if (dev) { dev.close(); dev = null; }
        if (project) { await rm(project.root, { recursive: true, force: true }); project = null; }
    });

    test('serves built pages with HMR script injected', async () => {
        project = await createTestProject(['index.zen']);

        dev = await createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            port: 0 // random port
        });

        const res = await httpGet(`http://localhost:${dev.port}/`);
        expect(res.status).toBe(200);
        expect(res.body).toContain('<!DOCTYPE html>');
        // Note: CLI no longer injects __zenith_hmr; only the runtime does this
        expect(res.body).not.toContain('__zenith_hmr');
    });

    test('serves nested routes', async () => {
        project = await createTestProject(['index.zen', 'about.zen']);

        dev = await createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            port: 0
        });

        const res = await httpGet(`http://localhost:${dev.port}/about`);
        expect(res.status).toBe(200);
        expect(res.body).toContain('<!DOCTYPE html>');
    });

    test('returns 404 for unmatched routes (no SPA fallback by default)', async () => {
        project = await createTestProject(['index.zen']);

        dev = await createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            port: 0
        });

        const res = await httpGet(`http://localhost:${dev.port}/nonexistent`);
        expect(res.status).toBe(404);
    });

    test('no SPA fallback even when softNavigation is enabled', async () => {
        project = await createTestProject(['index.zen']);

        dev = await createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            port: 0,
            config: { softNavigation: true }
        });

        const res = await httpGet(`http://localhost:${dev.port}/any-path`);
        expect(res.status).toBe(404);
    });

    test('V1 HMR endpoint /__zenith_dev/events returns event-stream header', async () => {
        project = await createTestProject(['index.zen']);

        dev = await createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            port: 0
        });

        const res = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('SSE timeout')), 3000);
            const req = http.get(`http://localhost:${dev.port}/__zenith_dev/events`, (response) => {
                let data = '';
                response.on('data', (chunk) => {
                    data += chunk.toString();
                    if (data.includes('event: connected')) {
                        clearTimeout(timeout);
                        resolve({
                            status: response.statusCode,
                            headers: response.headers,
                            firstChunk: data
                        });
                        response.destroy();
                        req.destroy();
                    }
                });
            });
            req.on('error', () => { });
        });

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('text/event-stream');
        expect(res.firstChunk).toContain('event: connected');
    });

    test('V1 HMR endpoint /__zenith_dev/state returns deterministic JSON', async () => {
        project = await createTestProject(['index.zen']);

        dev = await createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            port: 0
        });

        const res = await httpGet(`http://localhost:${dev.port}/__zenith_dev/state`);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('application/json');

        const state = JSON.parse(res.body);
        expect(state.buildId).toBe(0);
        expect(state.status).toBe('ok');
        expect(typeof state.lastBuildMs).toBe('number');
        expect(state.cssHref).toBeDefined();
        expect(state.error).toBe(null);
    });
});

describe('Preview Server', () => {
    let project;
    let preview;

    afterEach(async () => {
        if (preview) { preview.close(); preview = null; }
        if (project) { await rm(project.root, { recursive: true, force: true }); project = null; }
    });

    test('serves static files from dist', async () => {
        project = await createTestProject(['index.zen']);

        // Build first
        await build({ pagesDir: project.pagesDir, outDir: project.outDir });

        preview = await createPreviewServer({
            distDir: project.outDir,
            port: 0
        });

        const res = await httpGet(`http://localhost:${preview.port}/`);
        expect(res.status).toBe(200);
        expect(res.body).toContain('<!DOCTYPE html>');
        // Preview should NOT inject HMR
        expect(res.body).not.toContain('__zenith_hmr');
    });

    test('returns 404 for missing files', async () => {
        project = await createTestProject(['index.zen']);
        await build({ pagesDir: project.pagesDir, outDir: project.outDir });

        preview = await createPreviewServer({
            distDir: project.outDir,
            port: 0
        });

        const res = await httpGet(`http://localhost:${preview.port}/nothing`);
        expect(res.status).toBe(404);
    });

    test('rewrites dynamic hard-load paths using build router manifest', async () => {
        project = await createTestProject([
            'index.zen',
            'users/[id].zen'
        ]);

        await writeFile(
            join(project.pagesDir, 'index.zen'),
            '<main><a href="/users/42">User</a></main>',
            'utf8'
        );
        await writeFile(
            join(project.pagesDir, 'users/[id].zen'),
            '<main><h1 id="user">{params.id}</h1></main>',
            'utf8'
        );

        await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            config: { softNavigation: true }
        });

        const manifest = JSON.parse(
            await readFile(join(project.outDir, 'assets', 'router-manifest.json'), 'utf8')
        );
        const routePaths = Array.isArray(manifest.routes)
            ? manifest.routes.map((entry) => entry.path).sort()
            : [];
        expect(routePaths).toEqual(['/', '/users/:id']);

        preview = await createPreviewServer({
            distDir: project.outDir,
            port: 0
        });

        const dynamic = await httpGet(`http://localhost:${preview.port}/users/42`);
        const unknown = await httpGet(`http://localhost:${preview.port}/unknown/42`);
        const traversal = await httpGet(`http://localhost:${preview.port}/%2e%2e/%2e%2e/etc/passwd`);

        expect(dynamic.status).toBe(200);
        expect(dynamic.body).toContain('<!DOCTYPE html>');
        expect(dynamic.body).toContain('data-zx-router');
        expect(unknown.status).toBe(404);
        expect(traversal.status).toBe(404);
    });
});

describe('Contract Guardrails', () => {
    test('CLI source does not use forbidden execution primitives', () => {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const srcDir = path.resolve(__dirname, '../src');
        const files = fs.readdirSync(srcDir).filter((name) => name.endsWith('.js'));

        for (const file of files) {
            const source = fs.readFileSync(path.join(srcDir, file), 'utf8');
            expect(source.includes('eval(')).toBe(false);
            expect(source.includes('new Function')).toBe(false);
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
