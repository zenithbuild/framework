import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { jest } from '@jest/globals';
import sharp from 'sharp';
import { cli } from '../dist/index.js';

process.env.ZENITH_NO_UI = '1';
process.env.NO_COLOR = '1';
process.env.CI = '1';

jest.setTimeout(30000);

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
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('not found');
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    return {
        port: typeof address === 'object' && address ? address.port : 0,
        close: () => new Promise((resolve) => server.close(resolve))
    };
}

async function createProject(target, remotePort) {
    const root = join(tmpdir(), `zenith-hosted-image-${target}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const files = {
        'pages/index.zen': '<main>Hosted image parity</main>\n',
        'zenith.config.js': [
            'module.exports = {',
            `  target: ${JSON.stringify(target)},`,
            "  basePath: '/docs',",
            '  images: {',
            '    remotePatterns: [',
            `      { protocol: 'http', hostname: '127.0.0.1', port: '${remotePort}', pathname: '/hero.png' }`,
            '    ],',
            '    dangerouslyAllowLocalNetwork: true',
            '  }',
            '};'
        ].join('\n')
    };

    for (const [relativePath, contents] of Object.entries(files)) {
        const absolutePath = join(root, relativePath);
        await mkdir(join(absolutePath, '..'), { recursive: true });
        await writeFile(absolutePath, contents, 'utf8');
    }

    return root;
}

function hostedImageEntrypoint(projectRoot, target) {
    if (target === 'vercel') {
        return join(projectRoot, 'dist', 'functions', '__zenith', 'image.func', 'index.js');
    }
    return join(projectRoot, 'dist', 'functions', '__zenith_image.mjs');
}

function hostedImageInternalUrl(target, search = '') {
    if (target === 'vercel') {
        return `https://example.com/__zenith/image${search}`;
    }
    return `https://example.com/.netlify/functions/__zenith_image${search}`;
}

async function executeHostedImage(projectRoot, target, search = '') {
    const entryPath = hostedImageEntrypoint(projectRoot, target);
    const mod = await import(pathToFileURL(entryPath).href);
    const request = new Request(hostedImageInternalUrl(target, search));
    if (target === 'vercel') {
        return mod.default.fetch(request);
    }
    return mod.default(request);
}

async function readHostedRouting(projectRoot, target) {
    if (target === 'vercel') {
        return JSON.parse(await readFile(join(projectRoot, 'dist', 'config.json'), 'utf8'));
    }
    return readFile(join(projectRoot, 'dist', 'publish', '_redirects'), 'utf8');
}

describe('hosted image endpoint parity', () => {
    let projectRoot = null;
    let remote = null;

    afterEach(async () => {
        if (remote) {
            await remote.close();
            remote = null;
        }
        if (projectRoot) {
            await rm(projectRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
            projectRoot = null;
        }
    });

    test.each(['vercel', 'netlify'])(
        '%s exposes hosted image endpoint wiring with base-path routing and node-parity headers',
        async (target) => {
            remote = await startRemoteImageServer();
            projectRoot = await createProject(target, remote.port);

            await cli(['build'], projectRoot);

            expect(existsSync(hostedImageEntrypoint(projectRoot, target))).toBe(true);

            const routing = await readHostedRouting(projectRoot, target);
            if (target === 'vercel') {
                expect(routing.routes).toEqual(expect.arrayContaining([
                    { src: '^/docs/_zenith/image/local/(.+)$', dest: '/_zenith/image/local/$1' },
                    { src: '^/docs/_zenith/image/?$', dest: '/__zenith/image' }
                ]));
            } else {
                expect(routing).toContain('/docs/_zenith/image/local/* /_zenith/image/local/:splat 200');
                expect(routing).toContain('/docs/_zenith/image /.netlify/functions/__zenith_image 200!');
            }

            const missing = await executeHostedImage(projectRoot, target);
            expect(missing.status).toBe(400);
            expect(await missing.json()).toEqual({ error: 'missing_url' });

            const imageUrl = `http://127.0.0.1:${remote.port}/hero.png`;
            const response = await executeHostedImage(
                projectRoot,
                target,
                `?url=${encodeURIComponent(imageUrl)}&w=1&q=75&f=png`
            );
            expect(response.status).toBe(200);
            expect(response.headers.get('content-type')).toBe('image/png');
            expect(response.headers.get('cache-control')).toBe('public, max-age=60');

            const body = await response.arrayBuffer();
            expect(body.byteLength).toBeGreaterThan(0);
        }
    );
});
