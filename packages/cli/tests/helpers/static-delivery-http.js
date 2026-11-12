import { expect } from '@jest/globals';
import { readdir, readFile } from 'node:fs/promises';
import http from 'node:http';
import { join } from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';

export function rawHttp(url, { method = 'GET', headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request(url, { method, headers }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: Buffer.concat(chunks)
                });
            });
        });
        req.on('error', reject);
        req.end();
    });
}

export function decodeEncoded(body, encoding) {
    if (encoding === 'gzip') {
        return gunzipSync(body);
    }
    if (encoding === 'br') {
        return brotliDecompressSync(body);
    }
    return body;
}

export async function expectNegotiatedStatic(url, fileBytes, typeFragment) {
    const identity = await rawHttp(url, { headers: { 'accept-encoding': 'identity' } });
    expect(identity.status).toBe(200);
    expect(identity.headers['content-encoding']).toBeUndefined();
    expect(identity.headers.vary).toBe('Accept-Encoding');
    expect(String(identity.headers['content-type'])).toContain(typeFragment);
    expect(String(identity.headers['content-type'])).toContain('charset=utf-8');
    expect(Number(identity.headers['content-length'])).toBe(fileBytes.length);
    expect(identity.body.equals(fileBytes)).toBe(true);

    const head = await rawHttp(url, {
        method: 'HEAD',
        headers: { 'accept-encoding': 'identity' }
    });
    expect(head.status).toBe(200);
    expect(head.body.length).toBe(0);
    expect(head.headers['content-encoding']).toBeUndefined();
    expect(head.headers.vary).toBe('Accept-Encoding');
    expect(head.headers['content-type']).toBe(identity.headers['content-type']);
    expect(head.headers['content-length']).toBe(identity.headers['content-length']);

    const gzipped = await rawHttp(url, { headers: { 'accept-encoding': 'gzip' } });
    expect(gzipped.status).toBe(200);
    expect(gzipped.headers['content-encoding']).toBe('gzip');
    expect(gzipped.headers.vary).toBe('Accept-Encoding');
    expect(Number(gzipped.headers['content-length'])).toBe(gzipped.body.length);
    expect(gzipped.body.length).toBeLessThan(fileBytes.length);
    expect(decodeEncoded(gzipped.body, 'gzip').equals(fileBytes)).toBe(true);

    const headGzip = await rawHttp(url, {
        method: 'HEAD',
        headers: { 'accept-encoding': 'gzip' }
    });
    expect(headGzip.status).toBe(200);
    expect(headGzip.body.length).toBe(0);
    expect(headGzip.headers['content-encoding']).toBe('gzip');
    expect(headGzip.headers['content-type']).toBe(gzipped.headers['content-type']);
    expect(headGzip.headers['content-length']).toBe(gzipped.headers['content-length']);
    expect(headGzip.headers.vary).toBe('Accept-Encoding');

    const brotli = await rawHttp(url, { headers: { 'accept-encoding': 'br, gzip' } });
    expect(brotli.status).toBe(200);
    expect(brotli.headers['content-encoding']).toBe('br');
    expect(brotli.headers.vary).toBe('Accept-Encoding');
    expect(Number(brotli.headers['content-length'])).toBe(brotli.body.length);
    expect(decodeEncoded(brotli.body, 'br').equals(fileBytes)).toBe(true);

    const excluded = await rawHttp(url, { headers: { 'accept-encoding': 'br;q=0, gzip;q=0' } });
    expect(excluded.status).toBe(200);
    expect(excluded.headers['content-encoding']).toBeUndefined();
    expect(excluded.headers.vary).toBe('Accept-Encoding');
    expect(excluded.body.equals(fileBytes)).toBe(true);
    expect(Number(excluded.headers['content-length'])).toBe(fileBytes.length);

    const ranged = await rawHttp(url, {
        headers: {
            'accept-encoding': 'identity',
            range: 'bytes=0-8'
        }
    });
    expect(ranged.status).toBe(200);
    expect(ranged.headers['content-range']).toBeUndefined();
    expect(ranged.body.equals(fileBytes)).toBe(true);
    expect(Number(ranged.headers['content-length'])).toBe(fileBytes.length);
}

export async function expectSkippedStatic(url, fileBytes, { charset = false } = {}) {
    const response = await rawHttp(url, { headers: { 'accept-encoding': 'br, gzip' } });
    expect(response.status).toBe(200);
    expect(response.headers['content-encoding']).toBeUndefined();
    expect(response.headers.vary).toBeUndefined();
    expect(response.body.equals(fileBytes)).toBe(true);
    expect(Number(response.headers['content-length'])).toBe(fileBytes.length);
    if (charset) {
        expect(String(response.headers['content-type'])).toContain('charset=utf-8');
    } else {
        expect(String(response.headers['content-type'])).not.toContain('charset');
    }
    return response;
}

export async function expectExactPlain(url, text, headers = {}) {
    const response = await rawHttp(url, {
        headers: { 'accept-encoding': 'br, gzip', ...headers }
    });
    expect(response.status).toBe(200);
    expect(response.headers['content-encoding']).toBeUndefined();
    expect(response.body.toString('utf8')).toBe(text);
    expect(response.body.length).toBeGreaterThanOrEqual(1024);
    return response;
}

export async function expectPlainContains(url, parts, headers = {}) {
    const response = await rawHttp(url, {
        headers: { 'accept-encoding': 'br, gzip', ...headers }
    });
    expect(response.headers['content-encoding']).toBeUndefined();
    const text = response.body.toString('utf8');
    for (const part of parts) {
        expect(text).toContain(part);
    }
    expect(response.body.length).toBeGreaterThanOrEqual(1024);
    return response;
}

export async function expectJsonPlain(url, { headers = {}, includes } = {}) {
    const response = await rawHttp(url, {
        headers: { 'accept-encoding': 'br, gzip', ...headers }
    });
    expect(response.headers['content-encoding']).toBeUndefined();
    const payload = JSON.parse(response.body.toString('utf8'));
    if (includes) {
        expect(JSON.stringify(payload)).toContain(includes);
    }
    expect(response.body.length).toBeGreaterThanOrEqual(1024);
    return payload;
}

export async function assertNoPrecompressedSidecars(root) {
    const found = [];
    async function walk(dir) {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name === 'node_modules') {
                continue;
            }
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                await walk(fullPath);
                continue;
            }
            if (/\.(?:html|css|js|mjs|json|svg|xml|txt|map|webmanifest)\.(?:br|gz)$/.test(entry.name)) {
                found.push(fullPath);
            }
        }
    }
    await walk(root);
    expect(found).toEqual([]);
}

export async function assertNoContentEncodingConfig(root) {
    const found = [];
    const needle = Buffer.from('Content-Encoding');
    async function walk(dir) {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name === 'node_modules') {
                continue;
            }
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                await walk(fullPath);
                continue;
            }
            const bytes = await readFile(fullPath);
            if (bytes.includes(needle)) {
                found.push(fullPath);
            }
        }
    }
    await walk(root);
    expect(found).toEqual([]);
}

export async function expectNodeDeliveryArtifacts(distDir) {
    const serverDir = join(distDir, 'server');
    expect(await readFile(join(serverDir, 'static-delivery.js'), 'utf8')).toContain("from './static-mime.js'");
    expect(await readFile(join(serverDir, 'static-mime.js'), 'utf8')).toContain('text/html; charset=utf-8');
    const serverSource = await readFile(join(serverDir, 'runtime', 'node-server.js'), 'utf8');
    expect(serverSource).toContain("from '../static-delivery.js'");
    expect(serverSource).toContain('immutableAssets');
}

const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
const REVALIDATE_CACHE = 'public, max-age=0, must-revalidate';

export async function expectStaticCacheSplit({
    origin,
    manifestPath,
    staticRoot,
    basePath = '/',
    publicPath = null,
    htmlPath = null,
    htmlRevalidates = false,
    routeCheckPath = null,
    imagePath = null
}) {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const immutable = manifest.assets.immutable;
    const prefix = basePath === '/' ? '/assets/' : `${basePath}/assets/`;
    expect(Array.isArray(immutable)).toBe(true);
    expect(immutable.length).toBeGreaterThan(0);
    expect(immutable.every((path) => path.startsWith(prefix))).toBe(true);
    expect(immutable.some((path) => path.endsWith('router-manifest.json') || path.endsWith('.html'))).toBe(false);

    let chosen = null;
    for (const requestPath of immutable) {
        const relative = (basePath === '/' ? requestPath : requestPath.slice(basePath.length)).replace(/^\/+/, '');
        const bytes = await readFile(join(staticRoot, relative));
        const compressible = requestPath.endsWith('.js') || requestPath.endsWith('.css');
        if (!chosen || (compressible && bytes.length >= 1024 && (!chosen.large))) {
            chosen = { requestPath, large: compressible && bytes.length >= 1024 };
        }
        if (chosen.large) {
            break;
        }
    }
    const asset = await rawHttp(`${origin}${chosen.requestPath}`, { headers: { 'accept-encoding': 'gzip' } });
    expect(asset.status).toBe(200);
    expect(asset.headers['cache-control']).toBe(IMMUTABLE_CACHE);
    if (chosen.large) {
        expect(asset.headers['content-encoding']).toBe('gzip');
        expect(asset.headers.vary).toBe('Accept-Encoding');
    }

    const router = await rawHttp(`${origin}${prefix}router-manifest.json`);
    expect(router.status).toBe(200);
    expect(router.headers['cache-control']).toBe(REVALIDATE_CACHE);

    if (publicPath) {
        const pub = await rawHttp(`${origin}${publicPath}`, { headers: { 'accept-encoding': 'gzip' } });
        expect(pub.status).toBe(200);
        expect(pub.headers['cache-control']).toBe(REVALIDATE_CACHE);
        expect(pub.headers.vary).toBe('Accept-Encoding');
        expect(pub.headers['content-encoding']).toBe('gzip');
    }
    if (htmlPath) {
        const html = await rawHttp(`${origin}${htmlPath}`, { headers: { 'accept-encoding': 'gzip' } });
        expect(html.status).toBe(200);
        expect(String(html.headers['cache-control'] || '')).not.toContain('immutable');
        if (htmlRevalidates) {
            expect(html.headers['cache-control']).toBe(REVALIDATE_CACHE);
            if (html.headers.vary || html.headers['content-encoding']) {
                expect(html.headers.vary).toBe('Accept-Encoding');
            }
        }
    }
    if (routeCheckPath) {
        const check = await rawHttp(`${origin}${routeCheckPath}`, {
            headers: { 'x-zenith-route-check': '1', 'accept-encoding': 'gzip' }
        });
        expect(String(check.headers['cache-control'] || '')).toContain('no-store');
        expect(String(check.headers['cache-control'] || '')).not.toContain('immutable');
        expect(check.headers['content-encoding']).toBeUndefined();
    }
    if (imagePath) {
        const image = await rawHttp(`${origin}${imagePath}`, { headers: { 'accept-encoding': 'gzip' } });
        expect(String(image.headers['cache-control'] || '')).not.toContain('immutable');
        expect(image.headers['content-encoding']).toBeUndefined();
    }
}
