import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import { matchRemotePattern } from './shared.js';

const MAX_REMOTE_REDIRECTS = 5;
const PINNED_REMOTE_TARGET = Symbol('zenithPinnedRemoteTarget');

function parseIpv4(address) {
    if (!address) {
        return null;
    }
    const parts = String(address).split('.');
    if (parts.length !== 4) {
        return null;
    }
    const octets = parts.map((part) => {
        if (!/^\d+$/.test(part)) {
            return null;
        }
        const value = Number.parseInt(part, 10);
        return value >= 0 && value <= 255 ? value : null;
    });
    return octets.every((part) => part !== null) ? octets : null;
}

function isBlockedIpv4(address) {
    const octets = parseIpv4(address);
    if (!octets) {
        return false;
    }
    const [a, b, c, d] = octets;
    if (a === 0 || a === 10 || a === 127 || a >= 224) {
        return true;
    }
    if (a === 100 && b >= 64 && b <= 127) {
        return true;
    }
    if (a === 169 && b === 254) {
        return true;
    }
    if (a === 172 && b >= 16 && b <= 31) {
        return true;
    }
    if (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) {
        return true;
    }
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) {
        return true;
    }
    if (a === 203 && b === 0 && c === 113) {
        return true;
    }
    return a === 255 && b === 255 && c === 255 && d === 255;
}

function leadingIpv6Hextet(address) {
    const first = String(address).toLowerCase().replace(/^\[|\]$/g, '').split('%')[0].split(':')[0];
    return Number.parseInt(first || '0', 16);
}

function mappedIpv4Address(address) {
    const normalized = String(address || '').toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
    if (normalized.includes('.')) {
        const candidate = normalized.slice(normalized.lastIndexOf(':') + 1);
        return parseIpv4(candidate) ? candidate : null;
    }
    const mappedHex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (mappedHex) {
        const high = Number.parseInt(mappedHex[1], 16);
        const low = Number.parseInt(mappedHex[2], 16);
        if (Number.isFinite(high) && Number.isFinite(low)) {
            return `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
        }
    }
    return null;
}

function isBlockedIpv6(address) {
    const normalized = String(address || '').toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
    if (!normalized) {
        return false;
    }
    const mapped = mappedIpv4Address(normalized);
    if (mapped) {
        return isBlockedIpv4(mapped);
    }
    if (normalized === '::' || normalized === '::1') {
        return true;
    }
    const first = leadingIpv6Hextet(normalized);
    if (!Number.isFinite(first)) {
        return false;
    }
    return (first & 0xfe00) === 0xfc00
        || (first & 0xffc0) === 0xfe80
        || (first & 0xff00) === 0xff00;
}

function normalizeHostnameAddress(hostname) {
    return String(hostname || '').replace(/^\[|\]$/g, '').split('%')[0];
}

export function isLocalNetworkAddress(address) {
    const normalized = normalizeHostnameAddress(address);
    if (!normalized) {
        return false;
    }
    if (isBlockedIpv4(normalized)) {
        return true;
    }
    return isBlockedIpv6(normalized);
}

function isLoopbackHostname(hostname) {
    const normalized = String(hostname || '').toLowerCase();
    return normalized === 'localhost' || normalized.endsWith('.localhost');
}

async function resolveRemoteAddress(url, config, lookupImpl = lookup) {
    const hostname = normalizeHostnameAddress(url.hostname);
    const allowLocalNetwork = Boolean(config.dangerouslyAllowLocalNetwork);
    if (!allowLocalNetwork && (isLoopbackHostname(hostname) || isLocalNetworkAddress(hostname))) {
        throw new Error('[Zenith:Image] Loopback and local network image fetches are blocked');
    }
    const literalFamily = isIP(hostname);
    if (literalFamily) {
        return {
            address: hostname,
            family: literalFamily
        };
    }
    const resolved = await lookupImpl(hostname, { all: true });
    if (!Array.isArray(resolved) || resolved.length === 0) {
        throw new Error('[Zenith:Image] Remote image hostname did not resolve');
    }
    if (!allowLocalNetwork && resolved.some((entry) => isLocalNetworkAddress(entry.address))) {
        throw new Error('[Zenith:Image] Private network image fetches are blocked');
    }
    return {
        address: resolved[0].address,
        family: resolved[0].family || isIP(resolved[0].address)
    };
}

function buildPinnedUrl(url, address, family) {
    const pinned = new URL(url.toString());
    pinned.hostname = family === 6 ? `[${address}]` : address;
    return pinned;
}

export async function resolveRemoteTarget(remoteUrl, config, lookupImpl = lookup) {
    const url = new URL(remoteUrl);
    if (!matchRemotePattern(url, config.remotePatterns)) {
        throw new Error('[Zenith:Image] Remote URL is not allowed by images.remotePatterns');
    }
    const resolved = await resolveRemoteAddress(url, config, lookupImpl);
    return {
        url,
        address: resolved.address,
        family: resolved.family,
        requestUrl: buildPinnedUrl(url, resolved.address, resolved.family)
    };
}

function remoteFetchHeaders(target) {
    return {
        'Accept': 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.1',
        'Host': target.url.host
    };
}

function createRemoteFetchOptions(target) {
    return {
        headers: remoteFetchHeaders(target),
        redirect: 'manual',
        [PINNED_REMOTE_TARGET]: target
    };
}

function normalizeRequestHeaders(headers = {}) {
    if (headers instanceof Headers) {
        return Object.fromEntries(headers.entries());
    }
    return { ...headers };
}

function responseHeadersFromNode(headers) {
    const out = new Headers();
    for (const [key, value] of Object.entries(headers || {})) {
        if (Array.isArray(value)) {
            for (const item of value) {
                out.append(key, String(item));
            }
            continue;
        }
        if (value !== undefined) {
            out.set(key, String(value));
        }
    }
    return out;
}

function nodeRequestOptions(target, options = {}) {
    const url = target.url;
    const protocol = url.protocol;
    if (protocol !== 'http:' && protocol !== 'https:') {
        throw new Error('[Zenith:Image] Remote image protocol must be http or https');
    }
    const headers = normalizeRequestHeaders(options.headers);
    const requestOptions = {
        protocol,
        hostname: target.address,
        port: url.port || (protocol === 'https:' ? 443 : 80),
        method: 'GET',
        path: `${url.pathname}${url.search}`,
        headers
    };
    const originalHostname = normalizeHostnameAddress(url.hostname);
    if (protocol === 'https:' && !isIP(originalHostname)) {
        requestOptions.servername = originalHostname;
    }
    return requestOptions;
}

async function fetchPinnedRemoteUrl(requestUrl, options = {}) {
    const target = options[PINNED_REMOTE_TARGET];
    if (!target) {
        return fetch(requestUrl, options);
    }
    const transport = target.url.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
        const request = transport.request(nodeRequestOptions(target, options), (response) => {
            const status = response.statusCode || 502;
            const body = status === 204 || status === 205 || status === 304
                ? null
                : Readable.toWeb(response);
            resolve(new Response(body, {
                status,
                statusText: response.statusMessage || '',
                headers: responseHeadersFromNode(response.headers)
            }));
        });
        request.on('error', reject);
        request.end();
    });
}

export async function validateRemoteTarget(remoteUrl, config) {
    return (await resolveRemoteTarget(remoteUrl, config)).url;
}

export async function fetchRemoteImage(remote, config, fetchImpl = fetchPinnedRemoteUrl, lookupImpl = lookup) {
    let current = remote instanceof URL ? remote : new URL(String(remote));
    for (let redirectCount = 0; redirectCount <= MAX_REMOTE_REDIRECTS; redirectCount += 1) {
        const target = await resolveRemoteTarget(current.toString(), config, lookupImpl);
        current = target.url;
        const response = await fetchImpl(target.requestUrl, createRemoteFetchOptions(target));
        if (response.status < 300 || response.status >= 400) {
            return response;
        }
        const location = response.headers.get('location');
        if (!location) {
            throw new Error('[Zenith:Image] Remote image redirect is missing a Location header');
        }
        try {
            await response.body?.cancel?.();
        } catch {
            // Ignore body cancellation errors while redirecting.
        }
        current = new URL(location, current);
    }
    throw new Error('[Zenith:Image] Remote image redirected too many times');
}
