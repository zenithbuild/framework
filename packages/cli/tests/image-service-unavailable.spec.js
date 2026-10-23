// Without @zenithbuild/image, the emitted server/images/service.js must answer
// /_zenith/image byte for byte like the full image service at f504c98d did for
// every request it rejects before fetching (JUD-83 output parity).
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { packageImageRuntime } from '../dist/package-image-runtime.js';
import { createProjectImageApi } from '../dist/project-images.js';

const JSON_TYPE = 'application/json';
const NOT_ALLOWED = '{"error":"image_request_failed","message":"[Zenith:Image] Remote URL is not allowed by images.remotePatterns"}';
// Observed from f504c98d no-image builds (node, vercel and netlify alike).
const BASE_RESPONSES = [
    ['/_zenith/image', 400, '{"error":"missing_url"}'],
    ['/_zenith/image?w=16', 400, '{"error":"missing_url"}'],
    ['/_zenith/image?url=/hero.png', 400, '{"error":"invalid_width"}'],
    ['/_zenith/image?url=/hero.png&w=16', 400, '{"error":"image_request_failed","message":"Invalid URL"}'],
    ['/_zenith/image?url=/hero.png&w=16&q=75&f=webp', 400, '{"error":"image_request_failed","message":"Invalid URL"}'],
    ['/_zenith/image?url=http%3A%2F%2F127.0.0.1%2Fa.png&w=16', 400, NOT_ALLOWED],
    ['/_zenith/image?url=https%3A%2F%2Fexample.com%2Fa.png&w=16', 400, NOT_ALLOWED]
];

let serverDir;
let service;
beforeAll(async () => {
    serverDir = await mkdtemp(join(tmpdir(), 'zenith-image-unavailable-'));
    // Built output is an ES module package (dist/package.json has type: module).
    await writeFile(join(serverDir, 'package.json'), '{"type":"module"}\n');
    await packageImageRuntime(serverDir, null);
    service = await import(pathToFileURL(join(serverDir, 'images', 'index.js')).href);
});
afterAll(async () => {
    await rm(serverDir, { recursive: true, force: true });
});

test('emitted no-image service imports only the emitted image-config.js', async () => {
    const source = await readFile(join(serverDir, 'images', 'service.js'), 'utf8');
    const specifiers = [...source.matchAll(/^import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    expect(specifiers).toEqual(['../image-config.js']);
    expect(source).not.toMatch(/\bimport\s*\(|\brequire\s*\(/);
});

describe.each(['emitted service', 'dev/preview fallback'])('%s', (kind) => {
    // No image-package marker in a fresh project root: dev and preview fall back to NO_IMAGES.
    const api = async () => (kind === 'emitted service' ? service : createProjectImageApi(serverDir, join(serverDir, 'dist'))());

    test.each(BASE_RESPONSES)('fetch handler: %s', async (path, status, body) => {
        const response = await (await api()).handleImageFetchRequest(new Request(`https://site.example${path}`), { config: {} });
        expect([response.status, [...response.headers.entries()], await response.text()])
            .toEqual([status, [['content-type', JSON_TYPE]], body]);
    });

    test.each(BASE_RESPONSES)('node handler: %s', async (path, status, body) => {
        const handlers = await api();
        const server = createServer((req, res) => {
            handlers.handleImageRequest(req, res, { requestUrl: new URL(req.url, 'http://127.0.0.1'), config: {} });
        });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        try {
            const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
            expect([response.status, response.headers.get('content-type'), await response.text()])
                .toEqual([status, JSON_TYPE, body]);
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
    });
});

test('a remote URL allowed by images.remotePatterns reports the missing package', async () => {
    const response = await service.handleImageFetchRequest(
        new Request('https://site.example/_zenith/image?url=https%3A%2F%2Fcdn.example.com%2Fa.png&w=16'),
        { config: { remotePatterns: [{ protocol: 'https', hostname: '*.example.com' }] } }
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
        error: 'image_request_failed',
        message: '[Zenith:Image] Remote image optimization requires @zenithbuild/image. Install it and rebuild.'
    });
});
