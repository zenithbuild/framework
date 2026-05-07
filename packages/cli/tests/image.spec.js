import { createServer } from 'node:http';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { jest } from '@jest/globals';
import sharp from 'sharp';
import { build } from '../dist/build.js';
import { createPreviewServer } from '../dist/preview.js';
import { __imageServiceTestHooks } from '../src/images/service.js';
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

async function startRemoteImageServer(onRequest = () => { }) {
    const png = await createPng1x1();
    const server = createServer((req, res) => {
        onRequest(req);
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
                basePath: '/docs',
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
        expect(html).toContain('/docs/_zenith/image/local/');
    });

    test('build materializes multiple static Image instances without executing page assets', async () => {
        const png = await createPng1x1();
        project = await makeProject({
            'src/pages/index.zen': '<main><Image src="/a.png" alt="A" /><Image src="/b.png" alt="B" /></main>\n',
            'public/a.png': png,
            'public/b.png': png
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

        const html = await readFile(join(project.outDir, 'index.html'), 'utf8');
        expect((html.match(/<img\b/g) || []).length).toBe(2);
        expect(html).toContain('alt="A"');
        expect(html).toContain('alt="B"');
    });

    test('build fails honestly when Image props are dynamic', async () => {
        const png = await createPng1x1();
        project = await makeProject({
            'src/pages/index.zen': [
                '<script lang="ts">',
                'const hero = "/hero.png";',
                '</script>',
                '<main><Image src={hero} alt="Hero" /></main>'
            ].join('\n'),
            'public/hero.png': png
        });

        await expect(build({
            pagesDir: project.pagesDir,
            outDir: project.outDir,
            config: {
                images: {
                    formats: ['webp'],
                    deviceSizes: [1],
                    imageSizes: [1]
                }
            }
        })).rejects.toThrow(/Image materialization only supports static literal props|unsupported dynamic Image prop expression|static literal props only/i);
    });

    test('preview auto-loads image config and rewrites allowed remote images through the image endpoint', async () => {
        remote = await startRemoteImageServer();
        const remoteUrl = `http://127.0.0.1:${remote.port}/hero.png`;
        project = await makeProject({
            'src/pages/index.zen': `<main><Image src="${remoteUrl}" alt="Remote hero" width={1} height={1} /></main>\n`,
            'zenith.config.js': [
                'module.exports = {',
                "  pagesDir: 'src/pages',",
                "  basePath: '/docs',",
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
                basePath: '/docs',
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
            port: 0,
            config: { basePath: '/docs' }
        });

        const baseUrl = `http://127.0.0.1:${preview.port}`;
        const previewHtml = await fetch(`${baseUrl}/docs/`).then((response) => response.text());
        expect(previewHtml).toContain('/docs/_zenith/image?');
        expect(previewHtml).not.toContain(`src="${remoteUrl}"`);

        const match = previewHtml.match(/src="([^"]*\/docs\/_zenith\/image\?[^"]+)"/);
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

    test('remote image guard blocks local network address forms', () => {
        const blocked = [
            '0.0.0.0',
            '10.0.0.4',
            '100.64.0.1',
            '127.0.0.1',
            '169.254.1.1',
            '172.16.0.1',
            '192.168.0.1',
            '224.0.0.1',
            '240.0.0.1',
            '::',
            '::1',
            'fc00::1',
            'fd00::1',
            'fe80::1',
            'ff02::1',
            '::ffff:127.0.0.1',
            '::ffff:7f00:1'
        ];

        for (const address of blocked) {
            expect(__imageServiceTestHooks.isLocalNetworkAddress(address)).toBe(true);
        }
        expect(__imageServiceTestHooks.isLocalNetworkAddress('93.184.216.34')).toBe(false);
        expect(__imageServiceTestHooks.isLocalNetworkAddress('2606:2800:220:1:248:1893:25c8:1946')).toBe(false);
    });

    test('remote image guard validates redirect targets before fetching redirected image', async () => {
        const config = {
            remotePatterns: [
                { protocol: 'http', hostname: '93.184.216.34', pathname: '/allowed.png' },
                { protocol: 'http', hostname: '127.0.0.1', pathname: '/blocked.png' }
            ]
        };
        const fetchImpl = jest.fn(async () => new Response('', {
            status: 302,
            headers: {
                Location: 'http://127.0.0.1/blocked.png'
            }
        }));

        await expect(__imageServiceTestHooks.fetchRemoteImage(
            new URL('http://93.184.216.34/allowed.png'),
            config,
            fetchImpl
        )).rejects.toThrow(/Loopback and local network image fetches are blocked/);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    test('remote image fetch pins the request to the validated address', async () => {
        const config = {
            remotePatterns: [
                { protocol: 'http', hostname: 'images.example.test', pathname: '/hero.png' }
            ]
        };
        const lookupImpl = jest.fn(async () => [
            { address: '93.184.216.34', family: 4 }
        ]);
        const fetchImpl = jest.fn(async (requestUrl, options) => {
            expect(requestUrl).toBeInstanceOf(URL);
            expect(requestUrl.hostname).toBe('93.184.216.34');
            expect(requestUrl.pathname).toBe('/hero.png');
            expect(options.headers.Host).toBe('images.example.test');
            expect(options.headers.Accept).toContain('image/');
            return new Response('ok', {
                status: 200,
                headers: { 'Content-Type': 'image/png' }
            });
        });

        const response = await __imageServiceTestHooks.fetchRemoteImage(
            new URL('http://images.example.test/hero.png'),
            config,
            fetchImpl,
            lookupImpl
        );

        expect(response.status).toBe(200);
        expect(lookupImpl).toHaveBeenCalledWith('images.example.test', { all: true });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    test('remote image fetch default path uses the pinned address and original Host header', async () => {
        const seenHosts = [];
        remote = await startRemoteImageServer((req) => {
            seenHosts.push(String(req.headers.host || ''));
        });
        const config = {
            remotePatterns: [
                {
                    protocol: 'http',
                    hostname: 'images.example.test',
                    port: String(remote.port),
                    pathname: '/hero.png'
                }
            ],
            dangerouslyAllowLocalNetwork: true
        };
        const lookupImpl = jest.fn(async () => [
            { address: '127.0.0.1', family: 4 }
        ]);

        const response = await __imageServiceTestHooks.fetchRemoteImage(
            new URL(`http://images.example.test:${remote.port}/hero.png`),
            config,
            undefined,
            lookupImpl
        );

        expect(response.status).toBe(200);
        expect(String(response.headers.get('content-type') || '')).toContain('image/png');
        expect(seenHosts).toEqual([`images.example.test:${remote.port}`]);
        expect(lookupImpl).toHaveBeenCalledWith('images.example.test', { all: true });
    });

    test('remote image redirects pin each validated hop independently', async () => {
        const config = {
            remotePatterns: [
                { protocol: 'http', hostname: 'images.example.test', pathname: '/start.png' },
                { protocol: 'http', hostname: 'cdn.example.test', pathname: '/final.png' }
            ]
        };
        const lookupImpl = jest.fn(async (hostname) => {
            if (hostname === 'images.example.test') {
                return [{ address: '93.184.216.34', family: 4 }];
            }
            if (hostname === 'cdn.example.test') {
                return [{ address: '93.184.216.35', family: 4 }];
            }
            return [{ address: '127.0.0.1', family: 4 }];
        });
        const fetchImpl = jest.fn(async (requestUrl, options) => {
            if (fetchImpl.mock.calls.length === 1) {
                expect(requestUrl.hostname).toBe('93.184.216.34');
                expect(options.headers.Host).toBe('images.example.test');
                return new Response('', {
                    status: 302,
                    headers: { Location: 'http://cdn.example.test/final.png' }
                });
            }
            expect(requestUrl.hostname).toBe('93.184.216.35');
            expect(options.headers.Host).toBe('cdn.example.test');
            return new Response('ok', {
                status: 200,
                headers: { 'Content-Type': 'image/png' }
            });
        });

        const response = await __imageServiceTestHooks.fetchRemoteImage(
            new URL('http://images.example.test/start.png'),
            config,
            fetchImpl,
            lookupImpl
        );

        expect(response.status).toBe(200);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(lookupImpl.mock.calls.map(([hostname]) => hostname)).toEqual([
            'images.example.test',
            'cdn.example.test'
        ]);
    });

    test('image materialization source contains no dynamic evaluation path', async () => {
        const source = await readFile(new URL('../src/images/materialize.ts', import.meta.url), 'utf8');

        expect(source.includes('new Function')).toBe(false);
        expect(source.includes('replaceImageMarkers')).toBe(true);
    });

    test('CLI contract documents the static image materialization boundary', async () => {
        const contract = await readFile(new URL('../CLI_CONTRACT.md', import.meta.url), 'utf8');

        expect(contract).toContain('Image HTML materialization consumes compiler-owned static `data-zenith-image` payloads');
        expect(contract).toContain('Dynamic or non-literal `Image` props are unsupported');
    });
});
