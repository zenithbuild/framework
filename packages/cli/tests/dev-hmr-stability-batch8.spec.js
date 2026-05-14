import { mkdir, rm, unlink, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jest } from '@jest/globals';
import { createDevServer } from '../dist/dev-server.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

jest.setTimeout(45000);

async function createProject(files) {
    const root = join(tmpdir(), `zenith-dev-hmr-batch8-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    for (const [relativePath, contents] of Object.entries(files)) {
        const absolutePath = join(root, relativePath);
        await mkdir(join(absolutePath, '..'), { recursive: true });
        await writeFile(absolutePath, contents, 'utf8');
    }
    return {
        root,
        pagesDir: join(root, 'pages'),
        outDir: join(root, 'dist')
    };
}

async function fetchText(url, headers = undefined) {
    const response = await fetch(url, { headers });
    return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: await response.text()
    };
}

async function waitFor(predicate, timeoutMs = 8000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const value = await predicate();
        if (value) {
            return value;
        }
        await new Promise((resolve) => setTimeout(resolve, 80));
    }
    throw new Error('Timed out waiting for condition');
}

function parseSseBlock(block) {
    const lines = String(block || '').split('\n');
    const eventLine = lines.find((line) => line.startsWith('event: '));
    const dataLine = lines.find((line) => line.startsWith('data: '));
    let data = {};
    if (dataLine) {
        try {
            data = JSON.parse(dataLine.slice(6));
        } catch {
            data = {};
        }
    }
    return {
        event: eventLine ? eventLine.slice(7).trim() : '',
        data
    };
}

function collectEventsUntil(port, onEvent, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
        const events = [];
        let responseRef = null;
        let buffer = '';
        let settled = false;

        const cleanup = () => {
            clearTimeout(timeout);
            if (responseRef) {
                responseRef.destroy();
            }
            req.destroy();
        };
        const finish = () => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(events);
        };
        const fail = (error) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(error);
        };
        const timeout = setTimeout(() => {
            fail(new Error(`Timed out waiting for dev events; saw ${events.map((item) => item.event).join(', ')}`));
        }, timeoutMs);

        const req = http.get(`http://127.0.0.1:${port}/__zenith_dev/events`, (response) => {
            responseRef = response;
            response.on('data', (chunk) => {
                buffer += chunk.toString();
                let splitIndex = buffer.indexOf('\n\n');
                while (splitIndex !== -1) {
                    const block = buffer.slice(0, splitIndex);
                    buffer = buffer.slice(splitIndex + 2);
                    const parsed = parseSseBlock(block);
                    if (parsed.event) {
                        events.push(parsed);
                        Promise.resolve(onEvent(parsed, events)).then((done) => {
                            if (done === true) {
                                finish();
                            }
                        }).catch(fail);
                    }
                    splitIndex = buffer.indexOf('\n\n');
                }
            });
        });
        req.on('error', fail);
    });
}

describe('Batch 8 dev HMR stability', () => {
    let project = null;
    let dev = null;

    afterEach(async () => {
        if (dev) {
            dev.close();
            dev = null;
        }
        if (project) {
            await rm(project.root, { recursive: true, force: true });
            project = null;
        }
    });

    test('saving a source file emits a reload and refreshed HTML uses the rebuilt output', async () => {
        project = await createProject({
            'pages/index.zen': '<main>v1</main>\n'
        });
        const pageFile = join(project.pagesDir, 'index.zen');
        dev = await createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            port: 0
        });

        const origin = `http://127.0.0.1:${dev.port}`;
        expect((await fetchText(`${origin}/`)).body).toContain('v1');
        let wroteUpdate = false;

        const events = await collectEventsUntil(dev.port, async (event) => {
            if (event.event === 'connected' && !wroteUpdate) {
                wroteUpdate = true;
                await writeFile(pageFile, '<main>v2</main>\n', 'utf8');
            }
            return event.event === 'reload';
        });

        expect(events.map((event) => event.event)).toEqual(expect.arrayContaining([
            'build_start',
            'build_complete',
            'reload'
        ]));
        const updated = await waitFor(async () => {
            const response = await fetchText(`${origin}/`);
            return response.status === 200 && response.body.includes('v2') ? response : null;
        });
        expect(updated.body).toContain('v2');
    });

    test('failed rebuilds surface a dev error page and recover on the next valid save', async () => {
        project = await createProject({
            'pages/index.zen': '<main>ok</main>\n'
        });
        const pageFile = join(project.pagesDir, 'index.zen');
        dev = await createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            port: 0
        });

        const origin = `http://127.0.0.1:${dev.port}`;
        let wroteInvalid = false;
        let wroteRecovery = false;

        await collectEventsUntil(dev.port, async (event) => {
            if (event.event === 'connected' && !wroteInvalid) {
                wroteInvalid = true;
                await writeFile(pageFile, '<main>{</main>\n', 'utf8');
            }
            if (event.event === 'build_error' && !wroteRecovery) {
                const failedPage = await fetchText(`${origin}/`);
                expect(failedPage.status).toBe(503);
                expect(failedPage.headers['x-zenith-dev-error']).toBe('build-failed');
                expect(failedPage.body).toContain('Zenith Dev Build Failed');
                wroteRecovery = true;
                await writeFile(pageFile, '<main>recovered</main>\n', 'utf8');
            }
            return wroteRecovery && event.event === 'reload';
        }, 16000);

        const recovered = await waitFor(async () => {
            const response = await fetchText(`${origin}/`);
            return response.status === 200 && response.body.includes('recovered') ? response : null;
        });
        expect(recovered.body).toContain('recovered');
    });

    test('static-to-interactive saves rebuild client assets and emit a full reload', async () => {
        project = await createProject({
            'pages/index.zen': '<main>static</main>\n'
        });
        const pageFile = join(project.pagesDir, 'index.zen');
        dev = await createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            port: 0
        });

        const origin = `http://127.0.0.1:${dev.port}`;
        expect((await fetchText(`${origin}/`)).body).not.toContain('index.dev.js');
        let wroteInteractive = false;

        await collectEventsUntil(dev.port, async (event) => {
            if (event.event === 'connected' && !wroteInteractive) {
                wroteInteractive = true;
                await writeFile(pageFile, [
                    '<script lang="ts">',
                    'function save() {}',
                    '</script>',
                    '<button on:click={save}>Save</button>'
                ].join('\n'), 'utf8');
            }
            return event.event === 'reload';
        });

        const page = await waitFor(async () => {
            const response = await fetchText(`${origin}/`);
            return response.status === 200 && response.body.includes('index.dev.js') ? response : null;
        });
        const script = page.body.match(/src="([^"]*index\.dev\.js)"/);
        expect(script).not.toBeNull();
        const asset = await fetchText(new URL(script[1], origin).toString());
        expect(asset.status).toBe(200);
    });

    test('route add and delete changes update dev route state without stale fallback', async () => {
        project = await createProject({
            'pages/index.zen': '<main>Home</main>\n'
        });
        const aboutFile = join(project.pagesDir, 'about.zen');
        dev = await createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            port: 0
        });

        const origin = `http://127.0.0.1:${dev.port}`;
        const before = await (await fetch(`${origin}/__zenith_dev/state`)).json();
        await writeFile(aboutFile, '<main>About</main>\n', 'utf8');
        const afterAdd = await waitFor(async () => {
            const state = await (await fetch(`${origin}/__zenith_dev/state`)).json();
            return state.buildId > before.buildId && state.status === 'ok' ? state : null;
        });
        const about = await fetchText(`${origin}/about`);
        expect(about.status).toBe(200);
        expect(about.body).toContain('About');

        await unlink(aboutFile);
        await waitFor(async () => {
            const state = await (await fetch(`${origin}/__zenith_dev/state`)).json();
            return state.buildId > afterAdd.buildId && state.status === 'ok' ? state : null;
        });
        expect((await fetchText(`${origin}/about`)).status).toBe(404);
    });
});
