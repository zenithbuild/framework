import { createDevServer } from '../dist/dev-server.js';
import { jest } from '@jest/globals';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import http from 'node:http';
import { createTestProject, httpGet, parseSseBlock, waitFor, localOrigin } from './helpers/dev-server-fixtures.js';

jest.setTimeout(45000);

describe('Dev Server HMR and SSE', () => {
    let project;
    let dev;

    afterEach(async () => {
        if (dev) { dev.close(); dev = null; }
        if (project) { await rm(project.root, { recursive: true, force: true }); project = null; }
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
            const req = http.get(`${localOrigin(dev.port)}/__zenith_dev/events`, (response) => {
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

        const res = await httpGet(`${localOrigin(dev.port)}/__zenith_dev/state`);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('application/json');

        const state = JSON.parse(res.body);
        expect(state.buildId).toBe(0);
        expect(state.status).toBe('ok');
        expect(typeof state.lastBuildMs).toBe('number');
        expect(typeof state.cssHref).toBe('string');
        expect(state.cssHref).toContain('/__zenith_dev/styles.css?buildId=');
        expect(state.error).toBe(null);

        const css = await httpGet(`${localOrigin(dev.port)}/__zenith_dev/styles.css`);
        expect(css.status).toBe(200);
        expect(String(css.headers['content-type'] || '')).toContain('text/css');
        expect(css.body.length).toBeGreaterThan(0);
    });

    test('rebuilds when non-page source files change', async () => {
        const root = join(tmpdir(), `zenith-dev-src-watch-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const pagesDir = join(root, 'src', 'pages');
        const componentsDir = join(root, 'src', 'components');
        const outDir = join(root, 'dist');
        const componentFile = join(componentsDir, 'header.zen');

        await mkdir(pagesDir, { recursive: true });
        await mkdir(componentsDir, { recursive: true });
        await writeFile(join(pagesDir, 'index.zen'), '<main>home</main>');
        await writeFile(componentFile, '<header>v1</header>');
        project = { root, pagesDir, outDir };

        dev = await createDevServer({
            pagesDir,
            outDir,
            port: 0
        });

        const before = JSON.parse((await httpGet(`${localOrigin(dev.port)}/__zenith_dev/state`)).body);
        await new Promise((resolve) => setTimeout(resolve, 120));
        await writeFile(componentFile, '<header>v2</header>');

        const after = await waitFor(async () => {
            const state = JSON.parse((await httpGet(`${localOrigin(dev.port)}/__zenith_dev/state`)).body);
            return state.buildId > before.buildId ? state : null;
        }, { timeoutMs: 5000, intervalMs: 120 });

        expect(after.buildId).toBeGreaterThan(before.buildId);
        expect(after.status).toBe('ok');
    });

    test('does not loop rebuilds from dist temp output events', async () => {
        const root = join(tmpdir(), `zenith-dev-dist-loop-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const pagesDir = join(root, 'pages');
        const componentsDir = join(root, 'components');
        const outDir = join(root, 'dist');
        const componentFile = join(componentsDir, 'header.zen');

        await mkdir(pagesDir, { recursive: true });
        await mkdir(componentsDir, { recursive: true });
        await writeFile(join(pagesDir, 'index.zen'), '<main>home</main>');
        await writeFile(componentFile, '<header>v1</header>');
        project = { root, pagesDir, outDir };

        dev = await createDevServer({
            pagesDir,
            outDir,
            port: 0
        });

        const before = JSON.parse((await httpGet(`${localOrigin(dev.port)}/__zenith_dev/state`)).body);
        await new Promise((resolve) => setTimeout(resolve, 120));
        await writeFile(componentFile, '<header>v2</header>');

        const settled = await waitFor(async () => {
            const state = JSON.parse((await httpGet(`${localOrigin(dev.port)}/__zenith_dev/state`)).body);
            if (state.buildId > before.buildId && state.status === 'ok') {
                return state;
            }
            return null;
        }, { timeoutMs: 5000, intervalMs: 120 });

        const later = await waitFor(async () => {
            const state = JSON.parse((await httpGet(`${localOrigin(dev.port)}/__zenith_dev/state`)).body);
            if (state.status === 'ok' && state.buildId === settled.buildId) {
                return state;
            }
            return null;
        }, { timeoutMs: 5000, intervalMs: 120 });

        expect(later.buildId).toBe(settled.buildId);
    });

    test('SSE stays alive across build_error and subsequent recovery build', async () => {
        const root = join(tmpdir(), `zenith-dev-build-recovery-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const pagesDir = join(root, 'pages');
        const pageFile = join(pagesDir, 'index.zen');
        const outDir = join(root, 'dist');
        await mkdir(pagesDir, { recursive: true });
        await writeFile(pageFile, '<main>ok</main>');
        project = { root, pagesDir, outDir };

        dev = await createDevServer({
            pagesDir,
            outDir,
            port: 0
        });

        let seenBuildError = false;
        let seenRecoveryComplete = false;
        let failedBuildId = -1;
        let recoveredBuildId = -1;

        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('build recovery timeout')), 10000);
            let buffer = '';
            let stage = 0;
            const req = http.get(`${localOrigin(dev.port)}/__zenith_dev/events`, (response) => {
                response.on('data', (chunk) => {
                    buffer += chunk.toString();
                    let splitIndex = buffer.indexOf('\n\n');
                    while (splitIndex !== -1) {
                        const block = buffer.slice(0, splitIndex);
                        buffer = buffer.slice(splitIndex + 2);
                        const parsed = parseSseBlock(block);

                        if (parsed.event === 'connected' && stage === 0) {
                            stage = 1;
                            writeFile(pageFile, '<main>{</main>').catch(() => { });
                        } else if (parsed.event === 'build_error' && stage === 1) {
                            stage = 2;
                            seenBuildError = true;
                            failedBuildId = Number(parsed.data?.buildId);
                            writeFile(pageFile, '<main>recovered</main>').catch(() => { });
                        } else if (parsed.event === 'build_complete' && stage === 2) {
                            const thisBuildId = Number(parsed.data?.buildId);
                            if (Number.isInteger(thisBuildId) && thisBuildId > failedBuildId) {
                                seenRecoveryComplete = true;
                                recoveredBuildId = thisBuildId;
                                clearTimeout(timeout);
                                response.destroy();
                                req.destroy();
                                resolve();
                                return;
                            }
                        }

                        splitIndex = buffer.indexOf('\n\n');
                    }
                });
            });
            req.on('error', reject);
        });

        expect(seenBuildError).toBe(true);
        expect(seenRecoveryComplete).toBe(true);
        expect(recoveredBuildId).toBeGreaterThan(failedBuildId);
    });
});
