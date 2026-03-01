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

function parseSseBlock(block) {
    const lines = String(block || '').split('\n');
    const eventLine = lines.find((line) => line.startsWith('event: '));
    const dataLine = lines.find((line) => line.startsWith('data: '));
    const event = eventLine ? eventLine.slice(7).trim() : '';
    let data = {};
    if (dataLine) {
        try {
            data = JSON.parse(dataLine.slice(6));
        } catch {
            data = {};
        }
    }
    return { event, data };
}

async function waitFor(predicate, { timeoutMs = 4000, intervalMs = 100 } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const result = await predicate();
        if (result) {
            return result;
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error('Timed out waiting for condition');
}

function localOrigin(port) {
    return `http://127.0.0.1:${port}`;
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

        const res = await httpGet(`${localOrigin(dev.port)}/`);
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

    test('no SPA fallback even when softNavigation is enabled', async () => {
        project = await createTestProject(['index.zen']);

        dev = await createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            port: 0,
            config: { softNavigation: true }
        });

        const res = await httpGet(`${localOrigin(dev.port)}/any-path`);
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

        await new Promise((resolve) => setTimeout(resolve, 800));
        const later = JSON.parse((await httpGet(`${localOrigin(dev.port)}/__zenith_dev/state`)).body);

        expect(later.status).toBe('ok');
        expect(later.buildId).toBe(settled.buildId);
    });

    test('css_update event includes resolvable stylesheet href', async () => {
        const root = join(tmpdir(), `zenith-dev-css-update-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const pagesDir = join(root, 'pages');
        const styleFile = join(root, 'styles.css');
        const outDir = join(root, 'dist');
        await mkdir(pagesDir, { recursive: true });
        await writeFile(join(pagesDir, 'index.zen'), '<main>home</main>');
        await writeFile(styleFile, '/* trigger */');
        project = { root, pagesDir, outDir };

        dev = await createDevServer({
            pagesDir,
            outDir,
            port: 0
        });

        const cssUpdate = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('css_update timeout')), 5000);
            let triggered = false;
            const req = http.get(`${localOrigin(dev.port)}/__zenith_dev/events`, (response) => {
                let data = '';
                response.on('data', (chunk) => {
                    data += chunk.toString();
                    if (!triggered && data.includes('event: connected')) {
                        triggered = true;
                        writeFile(styleFile, '/* trigger 2 */').catch(() => { });
                    }
                    if (data.includes('event: css_update')) {
                        const blocks = data.split('\n\n');
                        for (const block of blocks) {
                            if (!block.includes('event: css_update')) continue;
                            const line = block.split('\n').find((entry) => entry.startsWith('data: '));
                            if (!line) continue;
                            clearTimeout(timeout);
                            try {
                                resolve(JSON.parse(line.slice(6)));
                            } catch {
                                resolve({});
                            }
                            response.destroy();
                            req.destroy();
                            return;
                        }
                    }
                });
            });
            req.on('error', reject);
        });

        expect(typeof cssUpdate.href).toBe('string');
        expect(cssUpdate.href).toContain('/__zenith_dev/styles.css?buildId=');

        const href = new URL(cssUpdate.href, localOrigin(dev.port));
        const css = await httpGet(href.toString());
        expect(css.status).toBe(200);
        expect(String(css.headers['content-type'] || '')).toContain('text/css');
        expect(css.body.length).toBeGreaterThan(0);
    });

    test('css_update emits only after build_complete with same buildId (repeat updates)', async () => {
        const root = join(tmpdir(), `zenith-dev-css-seq-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const pagesDir = join(root, 'pages');
        const styleFile = join(root, 'styles.css');
        const outDir = join(root, 'dist');
        await mkdir(pagesDir, { recursive: true });
        await writeFile(join(pagesDir, 'index.zen'), '<main>home</main>');
        await writeFile(styleFile, '/* seq-0 */');
        project = { root, pagesDir, outDir };

        dev = await createDevServer({
            pagesDir,
            outDir,
            port: 0
        });

        const events = [];
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('css sequence timeout')), 8000);
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
                        if (parsed.event) {
                            events.push(parsed);
                        }

                        if (parsed.event === 'connected' && stage === 0) {
                            stage = 1;
                            writeFile(styleFile, '/* seq-1 */').catch(() => { });
                        } else if (parsed.event === 'css_update' && stage === 1) {
                            stage = 2;
                            writeFile(styleFile, '/* seq-2 */').catch(() => { });
                        } else if (parsed.event === 'css_update' && stage === 2) {
                            clearTimeout(timeout);
                            response.destroy();
                            req.destroy();
                            resolve();
                            return;
                        }

                        splitIndex = buffer.indexOf('\n\n');
                    }
                });
            });
            req.on('error', reject);
        });

        const buildCompleteById = new Map();
        const buildStartById = new Map();
        const cssUpdates = [];

        for (const item of events) {
            const buildId = Number(item.data?.buildId);
            if (!Number.isInteger(buildId)) continue;
            if (item.event === 'build_start') {
                buildStartById.set(buildId, (buildStartById.get(buildId) || 0) + 1);
            }
            if (item.event === 'build_complete') {
                buildCompleteById.set(buildId, (buildCompleteById.get(buildId) || 0) + 1);
            }
            if (item.event === 'css_update') {
                cssUpdates.push(item.data);
            }
        }

        expect(cssUpdates.length).toBeGreaterThanOrEqual(2);

        for (const update of cssUpdates) {
            const buildId = Number(update.buildId);
            expect(buildStartById.get(buildId)).toBe(1);
            expect(buildCompleteById.get(buildId)).toBe(1);

            const href = String(update.href || '');
            expect(href).toContain('/__zenith_dev/styles.css?buildId=');
            const css = await httpGet(new URL(href, localOrigin(dev.port)).toString());
            expect(css.status).toBe(200);
            expect(css.body.length).toBeGreaterThan(0);
        }

        const firstCssIndex = events.findIndex((entry) => entry.event === 'css_update');
        const firstCompleteIndex = events.findIndex((entry) => entry.event === 'build_complete');
        expect(firstCompleteIndex).toBeGreaterThanOrEqual(0);
        expect(firstCssIndex).toBeGreaterThan(firstCompleteIndex);
    });

    test('stable /__zenith_dev/styles.css remains 200 during back-to-back css rebuilds', async () => {
        const root = join(tmpdir(), `zenith-dev-css-race-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const pagesDir = join(root, 'pages');
        const styleFile = join(root, 'styles.css');
        const outDir = join(root, 'dist');
        await mkdir(pagesDir, { recursive: true });
        await writeFile(join(pagesDir, 'index.zen'), '<main>race</main>');
        await writeFile(styleFile, '/* race-0 */');
        project = { root, pagesDir, outDir };

        dev = await createDevServer({
            pagesDir,
            outDir,
            port: 0
        });

        const cssStatuses = [];
        let pollPromise = Promise.resolve();

        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('css race timeout')), 10000);
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
                            writeFile(styleFile, '/* race-1 */').catch(() => { });
                        } else if (parsed.event === 'css_update' && stage === 1) {
                            stage = 2;
                            const href = new URL(String(parsed.data?.href || '/__zenith_dev/styles.css'), localOrigin(dev.port)).toString();
                            writeFile(styleFile, '/* race-2 */').catch(() => { });
                            pollPromise = (async () => {
                                for (let i = 0; i < 16; i += 1) {
                                    const css = await httpGet(href);
                                    cssStatuses.push(css.status);
                                    await new Promise((r) => setTimeout(r, 20));
                                }
                            })();
                        } else if (parsed.event === 'css_update' && stage === 2) {
                            clearTimeout(timeout);
                            response.destroy();
                            req.destroy();
                            resolve();
                            return;
                        }

                        splitIndex = buffer.indexOf('\n\n');
                    }
                });
            });
            req.on('error', reject);
        });

        await pollPromise;
        expect(cssStatuses.length).toBeGreaterThan(0);
        for (const status of cssStatuses) {
            expect(status).toBe(200);
        }
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

        const res = await httpGet(`${localOrigin(preview.port)}/`);
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

        const res = await httpGet(`${localOrigin(preview.port)}/nothing`);
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

        const dynamic = await httpGet(`${localOrigin(preview.port)}/users/42`);
        const unknown = await httpGet(`${localOrigin(preview.port)}/unknown/42`);
        const traversal = await httpGet(`${localOrigin(preview.port)}/%2e%2e/%2e%2e/etc/passwd`);

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
            expect(/\bFunction\(/.test(source)).toBe(false);
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
