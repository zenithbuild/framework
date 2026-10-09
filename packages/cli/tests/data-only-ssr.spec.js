import { jest } from '@jest/globals';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { _applyMarkerValue } from '../../runtime/src/render.js';
import { cli } from '../dist/index.js';
import { createPreviewServer } from '../dist/preview.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const jsdomDir = dirname(require.resolve('jest-environment-jsdom/package.json'));
const { JSDOM } = require(require.resolve('jsdom', { paths: [jsdomDir] }));

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';
jest.setTimeout(30000);

describe('router-disabled request data SSR', () => {
    let root;
    let server;
    let preview;
    afterEach(async () => {
        server?.close();
        preview?.close();
        server = null;
        preview = null;
        if (root) await rm(root, { recursive: true, force: true });
    });

    test('Node and preview render request data into text and attributes before JavaScript runs', async () => {
        root = await mkdtemp(join(tmpdir(), 'zenith-data-only-ssr-'));
        await mkdir(join(root, 'pages'));
        await writeFile(join(root, 'zenith.config.js'), 'module.exports = { target: "node", router: false };\n');
        await writeFile(join(root, 'pages', 'index.zen'), [
            '<script server lang="ts">',
            'export const guard = async (ctx) => ctx.url.searchParams.has("deny") ? ctx.deny(403) : ctx.url.searchParams.has("redirect") ? ctx.redirect("/login", 307) : ctx.allow();',
            'export const load = async (ctx) => ctx.data({ title: ctx.url.searchParams.get("title") || "default", count: 3 });',
            '</script>',
            '<main><h1 title={data.title}>Hello {data.title}!</h1><p>{data.count + 1}</p></main>'
        ].join('\n'));
        await cli(['build'], root);
        const entry = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
        server = await entry.createNodeServer({ port: 0, host: '127.0.0.1' });
        preview = await createPreviewServer({ distDir: join(root, '.zenith-output', 'static'), port: 0 });
        for (const origin of [`http://127.0.0.1:${server.port}`, `http://127.0.0.1:${preview.port}`]) {
            for (const title of ['Ada', '<img src=x onerror=alert(1)>"&']) {
                const response = await fetch(`${origin}/?title=${encodeURIComponent(title)}`);
                expect(response.status).toBe(200);
                const html = await response.text();
                const document = new JSDOM(html).window.document;
                expect(document.querySelector('h1').textContent).toBe(`Hello ${title}!`);
                expect(document.querySelector('h1').getAttribute('title')).toBe(title);
                expect(document.querySelector('p').textContent).toBe('4');
                expect(document.querySelector('img')).toBeNull();
                expect(document.querySelectorAll('script[type="module"]').length).toBe(1);
                const walker = document.createTreeWalker(document, 128);
                const anchors = [];
                while (walker.nextNode()) {
                    if (/^zx-e:\d+$/.test(walker.currentNode.data)) anchors.push(walker.currentNode);
                }
                expect(anchors.length).toBeGreaterThan(0);
                for (const anchor of anchors) {
                    _applyMarkerValue([anchor], { index: 0, kind: 'text' }, title);
                    _applyMarkerValue([anchor], { index: 0, kind: 'text' }, title);
                }
                expect(document.querySelector('h1').textContent).toBe(`Hello ${title}!`);
            }
            expect((await fetch(`${origin}/?deny`)).status).toBe(403);
            const redirected = await fetch(`${origin}/?redirect`, { redirect: 'manual' });
            expect(redirected.status).toBe(307);
            expect(redirected.headers.get('location')).toBe('/login');
            const isolated = await Promise.all(['one', 'two'].map(async (title) => {
                const response = await fetch(`${origin}/?title=${title}`);
                return new JSDOM(await response.text()).window.document.querySelector('h1').textContent;
            }));
            expect(isolated).toEqual(['Hello one!', 'Hello two!']);
        }
        const staticHtml = await readFile(join(root, '.zenith-output', 'static', 'index.html'), 'utf8');
        expect(staticHtml).not.toContain('Ada');
    });
});
