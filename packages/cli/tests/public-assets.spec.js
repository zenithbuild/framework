import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { jest } from '@jest/globals';
import sharp from 'sharp';
import { build } from '../dist/build.js';
import { cli } from '../dist/index.js';
import { createDevServer } from '../dist/dev-server.js';
import { createPreviewServer } from '../dist/preview.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

jest.setTimeout(60000);

async function createPng1x1() {
    return sharp({
        create: {
            width: 1,
            height: 1,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 }
        }
    }).png().toBuffer();
}

async function makeProject(files) {
    const root = join(tmpdir(), `zenith-public-assets-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    for (const [relativePath, contents] of Object.entries(files)) {
        const fullPath = join(root, relativePath);
        await mkdir(join(fullPath, '..'), { recursive: true });
        await writeFile(fullPath, contents);
    }
    return {
        root,
        pagesDir: join(root, 'src', 'pages'),
        outDir: join(root, 'dist')
    };
}

async function fetchText(origin, pathname) {
    const response = await fetch(`${origin}${pathname}`, { redirect: 'manual' });
    return {
        status: response.status,
        body: await response.text(),
        headers: response.headers
    };
}

async function waitForText(origin, pathname, expected, timeoutMs = 4000) {
    const startedAt = Date.now();
    let last = null;
    while (Date.now() - startedAt < timeoutMs) {
        try {
            last = await fetchText(origin, pathname);
            if (last.status === 200 && last.body === expected) {
                return last;
            }
        } catch {
            // Keep polling while the dev server finishes the rebuild.
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out waiting for ${pathname}; last=${JSON.stringify({
        status: last?.status,
        body: last?.body
    })}`);
}

async function importNodeServer(projectRoot) {
    const mod = await import(`${pathToFileURL(join(projectRoot, 'dist', 'index.js')).href}?t=${Date.now()}`);
    return mod.createNodeServer({
        distDir: join(projectRoot, 'dist'),
        port: 0,
        host: '127.0.0.1'
    });
}

describe('public assets', () => {
    let project = null;
    let dev = null;
    let preview = null;
    let nodeServer = null;

    afterEach(async () => {
        if (dev) {
            dev.close();
            dev = null;
        }
        if (preview) {
            preview.close();
            preview = null;
        }
        if (nodeServer) {
            nodeServer.close();
            nodeServer = null;
        }
        delete globalThis.__zenithPublicAssetMiddlewareRuns;
        if (project) {
            await rm(project.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
            project = null;
        }
    });

    test('build copies root and src public files while preserving image indexing', async () => {
        const png = await createPng1x1();
        project = await makeProject({
            'src/pages/index.zen': '<main>Home</main>\n',
            'public/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"><title>Logo</title></svg>\n',
            'src/public/images/photo.png': png,
            'src/public/fonts/app.woff2': 'font-data'
        });

        await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            config: {
                images: {
                    formats: ['webp'],
                    deviceSizes: [1],
                    imageSizes: [1]
                }
            }
        });

        expect(await readFile(join(project.outDir, 'logo.svg'), 'utf8')).toContain('<title>Logo</title>');
        expect(await readFile(join(project.outDir, 'fonts', 'app.woff2'), 'utf8')).toBe('font-data');
        await expect(readFile(join(project.outDir, 'images', 'photo.png'))).resolves.toBeInstanceOf(Buffer);

        const imageManifest = JSON.parse(
            await readFile(join(project.outDir, '_zenith', 'image', 'manifest.json'), 'utf8')
        );
        expect(imageManifest['/images/photo.png']).toMatchObject({
            width: 1,
            height: 1,
            availableWidths: [1]
        });
    });

    test('src/public wins duplicate public paths without overwriting generated framework files', async () => {
        project = await makeProject({
            'src/pages/index.zen': '<main>Generated route</main>\n',
            'public/shared.txt': 'root-public',
            'src/public/shared.txt': 'src-public',
            'public/index.html': '<main>public collision</main>',
            'public/manifest.json': '{"public":true}',
            'public/assets/router-manifest.json': '{"public":true}'
        });

        await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            config: { router: true }
        });

        expect(await readFile(join(project.outDir, 'shared.txt'), 'utf8')).toBe('src-public');
        expect(await readFile(join(project.outDir, 'index.html'), 'utf8')).toContain('Generated route');
        expect(await readFile(join(project.outDir, 'index.html'), 'utf8')).not.toContain('public collision');
        expect(await readFile(join(project.outDir, 'manifest.json'), 'utf8')).not.toBe('{"public":true}');
        expect(await readFile(join(project.outDir, 'assets', 'router-manifest.json'), 'utf8')).not.toBe('{"public":true}');
    });

    test('preview serves copied public assets with static MIME types', async () => {
        project = await makeProject({
            'src/pages/index.zen': '<main>Home</main>\n',
            'src/public/favicon.ico': 'icon-data',
            'src/public/fonts/app.woff2': 'font-data',
            'src/public/site.webmanifest': '{"name":"Zenith"}'
        });

        await build({ pagesDir: project.pagesDir, outDir: project.outDir });
        preview = await createPreviewServer({ distDir: project.outDir, port: 0 });
        const origin = `http://127.0.0.1:${preview.port}`;

        const icon = await fetchText(origin, '/favicon.ico');
        expect(icon.status).toBe(200);
        expect(icon.headers.get('content-type')).toMatch(/image\/x-icon|application\/octet-stream/);
        expect(icon.body).toBe('icon-data');

        const font = await fetchText(origin, '/fonts/app.woff2');
        expect(font.status).toBe(200);
        expect(font.headers.get('content-type')).toMatch(/font\/woff2|application\/octet-stream/);
        expect(font.body).toBe('font-data');

        const manifest = await fetchText(origin, '/site.webmanifest');
        expect(manifest.status).toBe(200);
        expect(manifest.headers.get('content-type')).toMatch(/manifest\+json|json|application\/octet-stream/);
        expect(manifest.body).toContain('Zenith');
    });

    test('dev server serves public assets from initial builds and rebuilds', async () => {
        project = await makeProject({
            'src/pages/index.zen': '<main>Home</main>\n',
            'src/public/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"><title>Initial</title></svg>\n'
        });

        dev = await createDevServer({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            projectRoot: project.root,
            port: 0
        });
        const origin = `http://127.0.0.1:${dev.port}`;

        const initial = await fetchText(origin, '/logo.svg');
        expect(initial.status).toBe(200);
        expect(initial.body).toContain('Initial');

        await mkdir(join(project.root, 'src', 'public'), { recursive: true });
        await writeFile(join(project.root, 'src', 'public', 'new.txt'), 'new-public-file');
        await waitForText(origin, '/new.txt', 'new-public-file');
    });

    test('node target serves public assets without running middleware', async () => {
        project = await makeProject({
            'src/pages/index.zen': '<main>Home</main>\n',
            'src/public/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"><title>Node</title></svg>\n',
            'src/middleware.ts': [
                'export default async function middleware(ctx, next) {',
                '  globalThis.__zenithPublicAssetMiddlewareRuns = (globalThis.__zenithPublicAssetMiddlewareRuns || 0) + 1;',
                '  return next();',
                '}'
            ].join('\n'),
            'zenith.config.js': 'module.exports = { target: "node" };\n'
        });

        await cli(['build'], project.root);
        delete globalThis.__zenithPublicAssetMiddlewareRuns;
        nodeServer = await importNodeServer(project.root);
        const origin = `http://127.0.0.1:${nodeServer.port}`;

        const response = await fetchText(origin, '/logo.svg');
        expect(response.status).toBe(200);
        expect(response.body).toContain('Node');
        expect(globalThis.__zenithPublicAssetMiddlewareRuns || 0).toBe(0);
    });

    test('static-export with basePath serves public assets under the base path', async () => {
        const png = await createPng1x1();
        project = await makeProject({
            'src/pages/index.zen': '<main>Home</main>\n',
            'src/public/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"><title>Docs</title></svg>\n',
            'src/public/images/photo.png': png,
            'zenith.config.js': 'module.exports = { target: "static-export", basePath: "/docs" };\n'
        });

        await cli(['build'], project.root);

        expect(existsSync(join(project.outDir, 'docs', 'logo.svg'))).toBe(true);
        expect(existsSync(join(project.outDir, 'docs', 'images', 'photo.png'))).toBe(true);

        preview = await createPreviewServer({ distDir: project.outDir, port: 0 });
        const response = await fetchText(`http://127.0.0.1:${preview.port}`, '/docs/logo.svg');
        expect(response.status).toBe(200);
        expect(response.body).toContain('Docs');
    });
});
