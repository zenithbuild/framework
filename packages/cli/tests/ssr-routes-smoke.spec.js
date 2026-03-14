import { build } from '../dist/build.js';
import { createDevServer } from '../dist/dev-server.js';
import { createPreviewServer } from '../dist/preview.js';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function makeProject(files) {
    const root = join(tmpdir(), `zenith-routes-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const pagesDir = join(root, 'pages');
    const outDir = join(root, 'dist');
    await mkdir(pagesDir, { recursive: true });

    for (const [file, source] of Object.entries(files)) {
        const fullPath = join(pagesDir, file);
        await mkdir(join(fullPath, '..'), { recursive: true });
        await writeFile(fullPath, source, 'utf8');
    }

    return { root, pagesDir, outDir };
}

async function closeServerInstance(instance) {
    if (!instance) {
        return;
    }

    const server = instance.server;
    if (!server || typeof server.once !== 'function') {
        instance.close();
        return;
    }

    await new Promise((resolveClose) => {
        let settled = false;
        const finish = () => {
            if (settled) {
                return;
            }
            settled = true;
            resolveClose(undefined);
        };

        server.once('close', finish);
        try {
            instance.close();
        } catch {
            finish();
            return;
        }

        setTimeout(finish, 250);
    });
}

describe('SSR Route Independence & Payload Smoke Test', () => {
    let project;
    let dev;
    let preview;

    afterEach(async () => {
        if (dev) {
            await closeServerInstance(dev);
            dev = null;
        }
        if (preview) {
            await closeServerInstance(preview);
            preview = null;
        }
        if (project) {
            await rm(project.root, { recursive: true, force: true });
            project = null;
        }
    });

    test('dev and preview resolve the same route params/patterns', async () => {
        project = await makeProject({
            'index.zen': [
                '<script server lang="ts">',
                'export const load = async (ctx) => ({ page: "home", route: ctx.route, params: ctx.params });',
                '</script>',
                '<html><head></head><body><main><h1>Home</h1></main></body></html>'
            ].join('\n'),
            'about.zen': [
                '<script server lang="ts">',
                'export const load = async (ctx) => ({ page: "about", route: ctx.route, params: ctx.params });',
                '</script>',
                '<html><head></head><body><main><h1>About</h1></main></body></html>'
            ].join('\n'),
            'blog/[...slug].zen': [
                '<script server lang="ts">',
                'export const load = async (ctx) => ({ page: "blog", route: ctx.route, params: ctx.params });',
                '</script>',
                '<html><head></head><body><main><h1>Blog</h1></main></body></html>'
            ].join('\n')
        });

        await build({ pagesDir: project.pagesDir, outDir: project.outDir, config: { softNavigation: false } });
        dev = await createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            port: 0,
            config: { softNavigation: false }
        });

        preview = await createPreviewServer({ distDir: project.outDir, port: 0 });
        const devBase = `http://localhost:${dev.port}`;
        const previewBase = `http://localhost:${preview.port}`;

        async function fetchPayload(baseUrl, path) {
            const res = await fetch(`${baseUrl}${path}`);
            expect(res.status).toBe(200);
            const html = await res.text();

            expect(html.includes('__zenith_ssr=')).toBe(false);
            const scriptMatches = html.match(/id="zenith-ssr-data"/g);
            if (!scriptMatches) {
                throw new Error(`missing SSR payload for ${baseUrl}${path}\n${html}`);
            }
            expect(scriptMatches).toBeTruthy();
            expect(scriptMatches.length).toBe(1);
            const payloadMatch = html.match(/window\.__zenith_ssr_data\s*=\s*(\{.*?\});/);
            expect(payloadMatch).toBeTruthy();
            return JSON.parse(payloadMatch[1]);
        }

        const paths = ['/', '/about', '/blog/hello-world/123'];
        for (const path of paths) {
            const devPayload = await fetchPayload(devBase, path);
            const previewPayload = await fetchPayload(previewBase, path);
            expect(devPayload).toEqual(previewPayload);
            expect(devPayload.params).toEqual(previewPayload.params);
            expect(devPayload.route.pattern).toBe(previewPayload.route.pattern);
            expect(devPayload.route.id).toBe(previewPayload.route.id);
        }

        expect(await fetchPayload(devBase, '/')).toEqual({
            page: 'home',
            route: {
                id: 'index',
                pattern: '/',
                file: expect.any(String)
            },
            params: {}
        });
        expect(await fetchPayload(previewBase, '/about')).toEqual({
            page: 'about',
            route: {
                id: 'about',
                pattern: '/about',
                file: expect.any(String)
            },
            params: {}
        });
        expect(await fetchPayload(devBase, '/blog/hello-world/123')).toEqual({
            page: 'blog',
            route: {
                id: 'blog/[...slug]',
                pattern: '/blog/*slug',
                file: expect.any(String)
            },
            params: { slug: 'hello-world/123' }
        });
    }, 30000);
});
