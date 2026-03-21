import { createServer } from 'node:http';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { jest } from '@jest/globals';
import sharp from 'sharp';
import { build } from '../dist/build.js';
import { createPreviewServer } from '../dist/preview.js';
import { buildLocalVariantPath } from '../src/images/shared.js';

jest.setTimeout(45000);

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
    const root = join(tmpdir(), `zenith-image-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

async function startRemoteImageServer() {
    const png = await createPng1x1();
    const server = createServer((req, res) => {
        if (req.url === '/hero.png') {
            res.writeHead(200, {
                'Content-Type': 'image/png',
                'Cache-Control': 'public, max-age=60'
            });
            res.end(png);
            return;
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('not found');
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    return {
        port: typeof address === 'object' && address ? address.port : 0,
        close: () => new Promise((resolve) => server.close(resolve))
    };
}

describe('native image optimization', () => {
    let project = null;
    let preview = null;
    let remote = null;

    afterEach(async () => {
        if (preview) {
            preview.close();
            preview = null;
        }
        if (remote) {
            await remote.close();
            remote = null;
        }
        if (project) {
            await rm(project.root, { recursive: true, force: true });
            project = null;
        }
    });

    test('build emits optimized local image variants and renders ordinary HTML', async () => {
        const png = await createPng1x1();
        project = await makeProject({
            'src/pages/index.zen': '<main><Image src="/hero.png" alt="Hero" sizes="100vw" /></main>\n',
            'public/hero.png': png
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

        const manifest = JSON.parse(
            await readFile(join(project.outDir, '_zenith', 'image', 'manifest.json'), 'utf8')
        );
        expect(manifest['/hero.png']).toMatchObject({
            width: 1,
            height: 1,
            availableWidths: [1]
        });
        expect(manifest['/hero.png'].availableFormats).toEqual(expect.arrayContaining(['png', 'webp']));

        const pngVariant = join(project.outDir, buildLocalVariantPath('/hero.png', 1, 75, 'png').replace(/^\//, ''));
        const webpVariant = join(project.outDir, buildLocalVariantPath('/hero.png', 1, 75, 'webp').replace(/^\//, ''));
        await expect(readFile(pngVariant)).resolves.toBeInstanceOf(Buffer);
        await expect(readFile(webpVariant)).resolves.toBeInstanceOf(Buffer);

        const html = await readFile(join(project.outDir, 'index.html'), 'utf8');
        expect(html).toContain('id="zenith-image-runtime"');
        expect(html).toContain('data-zenith-image=');
        expect(html).toContain('<picture>');
        expect(html).toContain('alt="Hero"');
        expect(html).toContain('/_zenith/image/local/');
    });

    test('preview auto-loads image config and rewrites allowed remote images through the image endpoint', async () => {
        remote = await startRemoteImageServer();
        const remoteUrl = `http://127.0.0.1:${remote.port}/hero.png`;
        project = await makeProject({
            'src/pages/index.zen': `<main><Image src="${remoteUrl}" alt="Remote hero" width={1} height={1} /></main>\n`,
            'zenith.config.js': [
                'module.exports = {',
                "  pagesDir: 'src/pages',",
                '  images: {',
                '    remotePatterns: [',
                `      { protocol: 'http', hostname: '127.0.0.1', port: '${remote.port}', pathname: '/hero.png' }`,
                '    ],',
                '    dangerouslyAllowLocalNetwork: true',
                '  }',
                '};'
            ].join('\n')
        });

        await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            config: {
                pagesDir: 'src/pages',
                images: {
                    remotePatterns: [
                        { protocol: 'http', hostname: '127.0.0.1', port: String(remote.port), pathname: '/hero.png' }
                    ],
                    dangerouslyAllowLocalNetwork: true
                }
            }
        });

        const builtHtml = await readFile(join(project.outDir, 'index.html'), 'utf8');
        expect(builtHtml).toContain(remoteUrl);

        preview = await createPreviewServer({
            distDir: project.outDir,
            port: 0
        });

        const baseUrl = `http://127.0.0.1:${preview.port}`;
        const previewHtml = await fetch(`${baseUrl}/`).then((response) => response.text());
        expect(previewHtml).toContain('/_zenith/image?');
        expect(previewHtml).not.toContain(`src="${remoteUrl}"`);

        const match = previewHtml.match(/src="([^"]*\/_zenith\/image\?[^"]+)"/);
        expect(match).not.toBeNull();
        const imagePath = match[1].replaceAll('&amp;', '&');

        const imageResponse = await fetch(new URL(imagePath, baseUrl));
        expect(imageResponse.status).toBe(200);
        expect(String(imageResponse.headers.get('content-type') || '')).toContain('image/');
    });

    test('preview blocks loopback remote optimization unless explicitly allowed', async () => {
        remote = await startRemoteImageServer();
        project = await makeProject({
            'src/pages/index.zen': '<main>Image security test</main>\n',
            'zenith.config.js': [
                'module.exports = {',
                "  pagesDir: 'src/pages',",
                '  images: {',
                '    remotePatterns: [',
                `      { protocol: 'http', hostname: '127.0.0.1', port: '${remote.port}', pathname: '/hero.png' }`,
                '    ]',
                '  }',
                '};'
            ].join('\n')
        });

        await build({
            pagesDir: project.pagesDir,
            outDir: project.outDir
        });

        preview = await createPreviewServer({
            distDir: project.outDir,
            port: 0
        });

        const response = await fetch(
            `http://127.0.0.1:${preview.port}/_zenith/image?url=${encodeURIComponent(`http://127.0.0.1:${remote.port}/hero.png`)}&w=1&q=75`
        );
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(payload.error).toBe('image_request_failed');
        expect(String(payload.message || '')).toContain('Loopback and local network image fetches are blocked');
    });
});
