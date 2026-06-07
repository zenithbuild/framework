import { createDevServer } from '../dist/dev-server.js';
import { jest } from '@jest/globals';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTestProject, httpGet, waitFor, localOrigin, getAvailablePort } from './helpers/dev-server-fixtures.js';

jest.setTimeout(45000);

describe('Dev Server startup and routing', () => {
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

        const res = await httpGet(`${localOrigin(dev.port)}/`);
        expect(res.status).toBe(200);
        expect(res.body).toContain('<!DOCTYPE html>');
        // Note: CLI no longer injects __zenith_hmr; only the runtime does this
        expect(res.body).not.toContain('__zenith_hmr');
    });

    test('binds before initial build completes and reports build-pending state', async () => {
        const files = ['index.zen'];
        for (let index = 0; index < 120; index += 1) {
            files.push(`pages-${index}.zen`);
        }
        project = await createTestProject(files);

        const port = await getAvailablePort();
        let devReady = false;
        const devPromise = createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            port
        }).then((instance) => {
            devReady = true;
            return instance;
        });

        const pendingState = await waitFor(async () => {
            try {
                const response = await httpGet(`${localOrigin(port)}/__zenith_dev/state`);
                if (response.status !== 200) {
                    return null;
                }
                const payload = JSON.parse(response.body);
                if (payload.status !== 'building') {
                    return null;
                }
                return payload;
            } catch {
                return null;
            }
        }, { timeoutMs: 5000, intervalMs: 50 });

        expect(devReady).toBe(false);
        expect(pendingState.buildId).toBe(0);
        expect(pendingState.status).toBe('building');

        const pendingPage = await httpGet(`${localOrigin(port)}/`);
        expect(pendingPage.status).toBe(503);
        expect(pendingPage.body).toContain('Zenith Dev Building');

        dev = await devPromise;

        const settledState = JSON.parse((await httpGet(`${localOrigin(dev.port)}/__zenith_dev/state`)).body);
        expect(settledState.status).toBe('ok');

        const res = await httpGet(`${localOrigin(dev.port)}/`);
        expect(res.status).toBe(200);
        expect(res.body).toContain('<!DOCTYPE html>');
    });

    test('serves nested routes', async () => {
        project = await createTestProject(['index.zen', 'about.zen']);

        dev = await createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            port: 0
        });

        const res = await httpGet(`${localOrigin(dev.port)}/about`);
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

        const res = await httpGet(`${localOrigin(dev.port)}/nonexistent`);
        expect(res.status).toBe(404);
    });

    test('no SPA fallback even when router is enabled', async () => {
        project = await createTestProject(['index.zen']);

        dev = await createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            port: 0,
            config: { router: true }
        });

        const res = await httpGet(`${localOrigin(dev.port)}/any-path`);
        expect(res.status).toBe(404);
    });

    test('returns classified diagnostics for unknown /__zenith_dev endpoints', async () => {
        project = await createTestProject(['index.zen']);

        dev = await createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            port: 0
        });

        const htmlRes = await httpGet(`${localOrigin(dev.port)}/__zenith_dev/not-real`);
        expect(htmlRes.status).toBe(404);
        expect(String(htmlRes.headers['content-type'] || '')).toContain('text/html');
        expect(htmlRes.body).toContain('Zenith Dev 404');
        expect(htmlRes.body).toContain('Category: dev_internal');

        const jsonRes = await httpGet(
            `${localOrigin(dev.port)}/__zenith_dev/not-real`,
            { accept: 'application/json' }
        );
        expect(jsonRes.status).toBe(404);
        expect(String(jsonRes.headers['content-type'] || '')).toContain('application/json');
        const payload = JSON.parse(jsonRes.body);
        expect(payload.kind).toBe('zenith_dev_not_found');
        expect(payload.category).toBe('dev_internal');
    });

    test('css endpoint returns clear build-failed response when initial build fails', async () => {
        const root = join(tmpdir(), `zenith-dev-css-error-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const pagesDir = join(root, 'pages');
        const outDir = join(root, 'dist');
        await mkdir(pagesDir, { recursive: true });
        await writeFile(join(pagesDir, 'index.zen'), '<main>{</main>');
        project = { root, pagesDir, outDir };

        dev = await createDevServer({
            pagesDir,
            outDir,
            port: 0
        });

        const state = JSON.parse((await httpGet(`${localOrigin(dev.port)}/__zenith_dev/state`)).body);
        expect(state.status).toBe('error');

        const css = await httpGet(`${localOrigin(dev.port)}/__zenith_dev/styles.css`);
        expect(css.status).toBe(503);
        expect(String(css.headers['x-zenith-dev-error'] || '')).toBe('build-failed');
        expect(css.body).toContain('css unavailable because build failed');
    });

    test('route 404 response includes route file guidance', async () => {
        project = await createTestProject(['index.zen']);

        dev = await createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            port: 0
        });

        const res = await httpGet(`${localOrigin(dev.port)}/docs`);
        expect(res.status).toBe(404);
        expect(res.body).toContain('src/pages/docs.zen');
    });
});
