// Without @zenithbuild/image, the emitted server/images/service.js must answer
// /_zenith/image byte for byte like the full image service at f504c98d did for
// every request it rejects before fetching (JUD-83 output parity).
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
    expect(specifiers).toEqual(['node:dns/promises', 'node:net', '../image-config.js']);
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

const IMAGE_SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'image', 'src');
const STUB_SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'server-runtime', 'image-service-unavailable.js');
function functionSource(source, name) {
    const match = source.match(new RegExp(`^(?:export )?(?:async )?function ${name}\\([\\s\\S]*?^}$`, 'm'));
    return match ? match[0].replace(/^export /, '') : null;
}

test.each([
    ['shared.js', ['escapeRegex', 'globToRegExp', 'hostnameMatches', 'matchRemotePattern']],
    ['remote-fetch.js', ['parseIpv4', 'isBlockedIpv4', 'leadingIpv6Hextet', 'mappedIpv4Address', 'isBlockedIpv6',
        'normalizeHostnameAddress', 'isLocalNetworkAddress', 'isLoopbackHostname', 'resolveRemoteAddress',
        'buildPinnedUrl', 'resolveRemoteTarget']]
])('pre-fetch checks are verbatim copies of @zenithbuild/image %s', async (file, names) => {
    const [image, stub] = await Promise.all([readFile(join(IMAGE_SRC, file), 'utf8'), readFile(STUB_SRC, 'utf8')]);
    for (const name of names) {
        expect([name, functionSource(stub, name)]).toEqual([name, functionSource(image, name)]);
        expect(functionSource(stub, name)).not.toBeNull();
    }
});

const failed = (message) => ({ error: 'image_request_failed', message });
const MISSING = failed('[Zenith:Image] Remote image optimization requires @zenithbuild/image. Install it and rebuild.');
const LOCAL = failed('[Zenith:Image] Loopback and local network image fetches are blocked');
const PRIVATE = failed('[Zenith:Image] Private network image fetches are blocked');
const PUBLIC_LOOKUP = async () => [{ address: '93.184.215.14', family: 4 }];
const PATTERNS = ['127.0.0.1', 'localhost', '*.localhost', '10.1.2.3', '192.168.0.10', '172.16.4.4', '169.254.169.254',
    '[::1]', '[fd00::1]', '[::ffff:7f00:1]', '*.example.com']
    .flatMap((hostname) => [{ protocol: 'http', hostname }, { protocol: 'https', hostname }])
    .concat([{ protocol: 'ftp', hostname: 'cdn.example.com' }]);
const imagePath = (remote) => `/_zenith/image?url=${encodeURIComponent(remote)}&w=16`;

// Same rejections as f504c98d's remote-fetch.js before any network I/O. The
// lookup stub keeps hostnames off real DNS; literal addresses never reach it.
const PRE_FETCH_CASES = [
    ['loopback IPv4', 'http://127.0.0.1/a.png', PUBLIC_LOOKUP, LOCAL],
    ['localhost', 'http://localhost/a.png', PUBLIC_LOOKUP, LOCAL],
    ['*.localhost', 'http://app.localhost/a.png', PUBLIC_LOOKUP, LOCAL],
    ['private 10/8', 'http://10.1.2.3/a.png', PUBLIC_LOOKUP, LOCAL],
    ['private 192.168/16', 'http://192.168.0.10/a.png', PUBLIC_LOOKUP, LOCAL],
    ['private 172.16/12', 'http://172.16.4.4/a.png', PUBLIC_LOOKUP, LOCAL],
    ['link-local metadata', 'http://169.254.169.254/latest', PUBLIC_LOOKUP, LOCAL],
    ['loopback IPv6', 'http://[::1]/a.png', PUBLIC_LOOKUP, LOCAL],
    ['unique-local IPv6', 'http://[fd00::1]/a.png', PUBLIC_LOOKUP, LOCAL],
    ['IPv4-mapped loopback', 'http://[::ffff:127.0.0.1]/a.png', PUBLIC_LOOKUP, LOCAL],
    ['hostname resolving to a private IPv4', 'https://cdn.example.com/a.png', async () => [{ address: '10.0.0.7', family: 4 }], PRIVATE],
    ['hostname with one private IPv6 answer', 'https://cdn.example.com/a.png',
        async () => [{ address: '93.184.215.14', family: 4 }, { address: 'fe80::1', family: 6 }], PRIVATE],
    ['hostname without addresses', 'https://cdn.example.com/a.png', async () => [],
        failed('[Zenith:Image] Remote image hostname did not resolve')],
    ['hostname lookup failure', 'https://cdn.example.com/a.png',
        async () => { throw new Error('getaddrinfo ENOTFOUND cdn.example.com'); }, failed('getaddrinfo ENOTFOUND cdn.example.com')],
    ['non-http protocol', 'ftp://cdn.example.com/a.png', PUBLIC_LOOKUP,
        failed('[Zenith:Image] Remote image protocol must be http or https')],
    ['public hostname the full service would fetch', 'https://cdn.example.com/a.png', PUBLIC_LOOKUP, MISSING]
];

describe.each(['emitted service', 'dev/preview fallback'])('%s pre-fetch checks', (kind) => {
    const api = async () => (kind === 'emitted service' ? service : createProjectImageApi(serverDir, join(serverDir, 'dist'))());

    test.each(PRE_FETCH_CASES)('%s', async (_name, remote, lookup, payload) => {
        const response = await (await api()).handleImageFetchRequest(
            new Request(`https://site.example${imagePath(remote)}`),
            { config: { remotePatterns: PATTERNS }, lookup }
        );
        expect([response.status, [...response.headers.entries()], await response.json()])
            .toEqual([400, [['content-type', JSON_TYPE]], payload]);
    });
});

test('dangerouslyAllowLocalNetwork lets local hosts through to the missing-package error', async () => {
    const response = await service.handleImageFetchRequest(
        new Request(`https://site.example${imagePath('http://127.0.0.1/a.png')}`),
        { config: { remotePatterns: PATTERNS, dangerouslyAllowLocalNetwork: true } }
    );
    expect([response.status, await response.json()]).toEqual([400, MISSING]);
});

test('the node handler sends the blocked-network response', async () => {
    const server = createServer((req, res) => {
        service.handleImageRequest(req, res, { requestUrl: new URL(req.url, 'http://127.0.0.1'), config: { remotePatterns: PATTERNS } });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
        const response = await fetch(`http://127.0.0.1:${server.address().port}${imagePath('http://10.1.2.3/a.png')}`);
        expect([response.status, response.headers.get('content-type'), await response.json()]).toEqual([400, JSON_TYPE, LOCAL]);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});
