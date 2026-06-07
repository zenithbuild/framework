import { createDevServer } from '../dist/dev-server.js';
import { jest } from '@jest/globals';
import { writeFile, rm } from 'node:fs/promises';
import http from 'node:http';
import { createTailwindDevProject, renderTailwindPage, httpGet, parseSseBlock, localOrigin } from './helpers/dev-server-fixtures.js';

jest.setTimeout(45000);

describe('Dev Server CSS and Tailwind', () => {
    let project;
    let dev;

    afterEach(async () => {
        if (dev) { dev.close(); dev = null; }
        if (project) { await rm(project.root, { recursive: true, force: true }); project = null; }
    });

    test('css_update event includes resolvable stylesheet href', async () => {
        project = await createTailwindDevProject('text-red-500');

        dev = await createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            port: 0
        });

        const cssUpdate = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('css_update timeout')), 15000);
            let triggered = false;
            const req = http.get(`${localOrigin(dev.port)}/__zenith_dev/events`, (response) => {
                let data = '';
                response.on('data', (chunk) => {
                    data += chunk.toString();
                    if (!triggered && data.includes('event: connected')) {
                        triggered = true;
                        writeFile(project.pageFile, renderTailwindPage('text-blue-500'), 'utf8').catch(() => { });
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
        expect(css.body).not.toContain('@import "tailwindcss"');
        expect(css.body.includes('.text-blue-500') || css.body.includes('color:var(--color-blue-500')).toBe(true);
    });

    test('css_update emits only after build_complete with same buildId (repeat updates)', async () => {
        project = await createTailwindDevProject('text-red-500');

        dev = await createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            port: 0
        });

        const events = [];
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('css sequence timeout')), 25000);
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
                            writeFile(project.pageFile, renderTailwindPage('text-emerald-500'), 'utf8').catch(() => { });
                        } else if (parsed.event === 'css_update' && stage === 1) {
                            stage = 2;
                            writeFile(project.pageFile, renderTailwindPage('text-blue-500'), 'utf8').catch(() => { });
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
        project = await createTailwindDevProject('text-red-500');

        dev = await createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            port: 0
        });

        const cssStatuses = [];
        let pollPromise = Promise.resolve();

        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('css race timeout')), 25000);
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
                            writeFile(project.pageFile, renderTailwindPage('text-emerald-500'), 'utf8').catch(() => { });
                        } else if (parsed.event === 'css_update' && stage === 1) {
                            stage = 2;
                            const href = new URL(String(parsed.data?.href || '/__zenith_dev/styles.css'), localOrigin(dev.port)).toString();
                            writeFile(project.pageFile, renderTailwindPage('text-blue-500'), 'utf8').catch(() => { });
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

    test('tailwind entry css compiles internally and refreshes compiled stylesheet after a .zen class edit', async () => {
        project = await createTailwindDevProject('text-red-500');

        dev = await createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            port: 0
        });

        const initialState = JSON.parse((await httpGet(`${localOrigin(dev.port)}/__zenith_dev/state`)).body);
        const initialCss = await httpGet(new URL(initialState.cssHref, localOrigin(dev.port)).toString());
        expect(initialCss.status).toBe(200);
        expect(initialCss.body).not.toContain('@import "tailwindcss"');
        expect(initialCss.body.includes('.text-red-500') || initialCss.body.includes('color:var(--color-red-500')).toBe(true);

        const cssUpdate = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('tailwind css_update timeout')), 8000);
            let buffer = '';
            let connected = false;
            const req = http.get(`${localOrigin(dev.port)}/__zenith_dev/events`, (response) => {
                response.on('data', (chunk) => {
                    buffer += chunk.toString();
                    let splitIndex = buffer.indexOf('\n\n');
                    while (splitIndex !== -1) {
                        const block = buffer.slice(0, splitIndex);
                        buffer = buffer.slice(splitIndex + 2);
                        const parsed = parseSseBlock(block);

                        if (parsed.event === 'connected' && !connected) {
                            connected = true;
                            writeFile(
                                project.pageFile,
                                renderTailwindPage('text-blue-500'),
                                'utf8'
                            ).catch(reject);
                        } else if (parsed.event === 'css_update') {
                            clearTimeout(timeout);
                            response.destroy();
                            req.destroy();
                            resolve(parsed.data);
                            return;
                        }

                        splitIndex = buffer.indexOf('\n\n');
                    }
                });
            });
            req.on('error', reject);
        });

        expect(String(cssUpdate.href || '')).toContain('/__zenith_dev/styles.css?buildId=');
        const updatedCss = await httpGet(new URL(String(cssUpdate.href), localOrigin(dev.port)).toString());
        expect(updatedCss.status).toBe(200);
        expect(updatedCss.body).not.toContain('@import "tailwindcss"');
        expect(updatedCss.body.includes('.text-blue-500') || updatedCss.body.includes('color:var(--color-blue-500')).toBe(true);
    });
});
