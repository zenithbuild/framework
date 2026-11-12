import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants as zlibConstants, gzip } from 'node:zlib';
import { STATIC_MIME_TYPES } from './static-mime.js';

const brotliCompressAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

// Local preview and standalone Node choice. This is not a byte-identical
// Vercel emulation; Vercel and Netlify keep owning CDN compression.
const BROTLI_QUALITY = 11;
const MIN_COMPRESS_BYTES = 1024;
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
export const REVALIDATE_CACHE_CONTROL = 'public, max-age=0, must-revalidate';
const CACHE_MAX_ENTRIES = 64;
const CACHE_MAX_BYTES = 32 * 1024 * 1024;
const PREFERRED_CODINGS = ['br', 'gzip', 'identity'];

const COMPRESSIBLE_EXTENSIONS = new Set([
    '.html',
    '.css',
    '.js',
    '.mjs',
    '.json',
    '.svg',
    '.xml',
    '.txt',
    '.map',
    '.webmanifest'
]);

const encodedCache = new Map();
const inflight = new Map();
let encodedCacheBytes = 0;

function headerText(value) {
    if (Array.isArray(value)) {
        return value.filter((entry) => typeof entry === 'string').join(',');
    }
    return typeof value === 'string' ? value : '';
}

function qualityFromParams(params) {
    for (const param of params) {
        const match = /^q\s*=\s*(.*)$/i.exec(param);
        if (!match) {
            continue;
        }
        const value = Number(match[1]);
        if (!Number.isFinite(value)) {
            return 0;
        }
        return Math.min(1, Math.max(0, value));
    }
    return 1;
}

/**
 * Pick a content coding for an Accept-Encoding header.
 * q=0 excludes a coding. `*` supplies the quality for codings that are not
 * listed. Preference among acceptable codings is br, then gzip, then identity;
 * q-values do not reorder that list. When nothing is acceptable, identity is
 * the fallback so the response still has a body.
 *
 * @param {string | string[] | undefined} header
 * @returns {'br' | 'gzip' | 'identity'}
 */
export function negotiateContentEncoding(header) {
    const raw = headerText(header).trim();
    if (!raw) {
        return 'identity';
    }

    const qualities = new Map();
    let starQuality = null;
    for (const part of raw.split(',')) {
        const token = part.trim();
        if (!token) {
            continue;
        }
        const [codingPart, ...params] = token.split(';').map((piece) => piece.trim()).filter(Boolean);
        const coding = codingPart.toLowerCase();
        if (!coding) {
            continue;
        }
        const quality = qualityFromParams(params);
        if (coding === '*') {
            if (starQuality === null) {
                starQuality = quality;
            }
            continue;
        }
        if (!qualities.has(coding)) {
            qualities.set(coding, quality);
        }
    }

    const qualityOf = (coding) => {
        if (qualities.has(coding)) {
            return qualities.get(coding);
        }
        if (starQuality !== null) {
            return starQuality;
        }
        return coding === 'identity' ? 1 : 0;
    };

    for (const coding of PREFERRED_CODINGS) {
        if (qualityOf(coding) > 0) {
            return coding;
        }
    }
    return 'identity';
}

function takeCached(key) {
    const hit = encodedCache.get(key);
    if (!hit) {
        return null;
    }
    encodedCache.delete(key);
    encodedCache.set(key, hit);
    return hit;
}

function storeCached(key, body) {
    const existing = encodedCache.get(key);
    if (existing) {
        encodedCacheBytes -= existing.length;
        encodedCache.delete(key);
    }
    encodedCache.set(key, body);
    encodedCacheBytes += body.length;
    while (
        encodedCache.size > 1 &&
        (encodedCache.size > CACHE_MAX_ENTRIES || encodedCacheBytes > CACHE_MAX_BYTES)
    ) {
        const oldest = encodedCache.keys().next().value;
        const evicted = encodedCache.get(oldest);
        encodedCache.delete(oldest);
        encodedCacheBytes -= evicted.length;
    }
}

async function compressBuffer(body, encoding) {
    if (encoding === 'br') {
        return brotliCompressAsync(body, {
            params: {
                [zlibConstants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY
            }
        });
    }
    if (encoding === 'gzip') {
        return gzipAsync(body);
    }
    return body;
}

async function compressedBody(filePath, fileStat, encoding) {
    const key = `${filePath}\0${fileStat.mtimeMs}\0${fileStat.size}\0${encoding}`;
    const cached = takeCached(key);
    if (cached) {
        return cached;
    }
    const pending = inflight.get(key);
    if (pending) {
        return pending;
    }

    const work = (async () => {
        const raw = await readFile(filePath);
        const encoded = await compressBuffer(raw, encoding);
        storeCached(key, encoded);
        return encoded;
    })();
    inflight.set(key, work);
    try {
        return await work;
    } finally {
        inflight.delete(key);
    }
}

function requestPathname(req) {
    try {
        return new URL(req?.url || '/', 'http://127.0.0.1').pathname;
    } catch {
        return null;
    }
}

/**
 * Immutable only when the request path is on the manifest allowlist loaded
 * at server start. Every other static file this helper sends revalidates.
 * Dynamic responses do not come through here.
 *
 * @param {string | null} pathname
 * @param {Set<string> | undefined} immutableAssets
 */
export function cacheControlForPath(pathname, immutableAssets) {
    if (pathname && immutableAssets && immutableAssets.has(pathname)) {
        return IMMUTABLE_CACHE_CONTROL;
    }
    return REVALIDATE_CACHE_CONTROL;
}

/**
 * Send a static file with Accept-Encoding negotiation.
 * Range is unsupported: the full representation is returned with status 200.
 * Content-Encoding is omitted for identity. Vary is set for every response
 * that is eligible to negotiate, including identity. Cache-Control is set
 * alongside those headers.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} filePath
 * @param {{ immutableAssets?: Set<string> }} [options]
 */
export async function sendStaticFile(req, res, filePath, options = {}) {
    const fileStat = await stat(filePath);
    const extension = extname(filePath).toLowerCase();
    const contentType = STATIC_MIME_TYPES[extension] || 'application/octet-stream';
    const negotiable = COMPRESSIBLE_EXTENSIONS.has(extension) && fileStat.size >= MIN_COMPRESS_BYTES;
    const encoding = negotiable
        ? negotiateContentEncoding(req?.headers?.['accept-encoding'])
        : 'identity';
    const body = encoding === 'identity'
        ? await readFile(filePath)
        : await compressedBody(filePath, fileStat, encoding);
    const headers = {
        'Content-Type': contentType,
        'Content-Length': body.length,
        'Cache-Control': cacheControlForPath(requestPathname(req), options.immutableAssets)
    };
    if (negotiable) {
        headers.Vary = 'Accept-Encoding';
    }
    if (encoding !== 'identity') {
        headers['Content-Encoding'] = encoding;
    }

    res.writeHead(200, headers);
    if (String(req?.method || 'GET').toUpperCase() === 'HEAD') {
        res.end();
        return;
    }
    res.end(body);
}
