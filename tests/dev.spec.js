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
        expect(res.body).toContain('__zenith_hmr');
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

    test('SPA fallback when router: true', async () => {
        project = await createTestProject(['index.zen']);

        dev = await createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            port: 0,
            config: { router: true }
        });

        const res = await httpGet(`http://localhost:${dev.port}/any-path`);
        expect(res.status).toBe(200);
        expect(res.body).toContain('<!DOCTYPE html>');
    });

    test('HMR endpoint returns event-stream header', async () => {
        project = await createTestProject(['index.zen']);

        dev = await createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            port: 0
        });

        const res = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('SSE timeout')), 3000);
            const req = http.get(`http://localhost:${dev.port}/__zenith_hmr`, (response) => {
                // Read first chunk to confirm connection
                response.once('data', (chunk) => {
                    clearTimeout(timeout);
                    resolve({
                        status: response.statusCode,
                        headers: response.headers,
                        firstChunk: chunk.toString()
                    });
                    response.destroy();
                    req.destroy();
                });
            });
            req.on('error', () => { });
        });

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('text/event-stream');
        expect(res.firstChunk).toContain(': connected');
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

            // Allow HMR client script (it's injected as a string for the browser)
            const withoutHmr = source.replace(/const HMR_CLIENT_SCRIPT[\s\S]*?`;/g, '');

            // Check remaining source
            const windowRefs = withoutHmr.match(/\bwindow\b/g) || [];
            const documentRefs = withoutHmr.match(/\bdocument\b/g) || [];

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
