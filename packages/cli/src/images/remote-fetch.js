import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { matchRemotePattern } from './shared.js';

const MAX_REMOTE_REDIRECTS = 5;

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

async function assertRemoteNetworkAllowed(url, config) {
    if (config.dangerouslyAllowLocalNetwork) {
        return;
    }
    const hostname = normalizeHostnameAddress(url.hostname);
    if (isLoopbackHostname(hostname) || isLocalNetworkAddress(hostname)) {
        throw new Error('[Zenith:Image] Loopback and local network image fetches are blocked');
    }
    if (isIP(hostname)) {
        return;
    }
    const resolved = await lookup(hostname, { all: true });
    if (resolved.some((entry) => isLocalNetworkAddress(entry.address))) {
        throw new Error('[Zenith:Image] Private network image fetches are blocked');
    }
}

export async function validateRemoteTarget(remoteUrl, config) {
    const url = new URL(remoteUrl);
    if (!matchRemotePattern(url, config.remotePatterns)) {
        throw new Error('[Zenith:Image] Remote URL is not allowed by images.remotePatterns');
    }
    await assertRemoteNetworkAllowed(url, config);
    return url;
}

export async function fetchRemoteImage(remote, config, fetchImpl = fetch) {
    let current = remote instanceof URL ? remote : new URL(String(remote));
    for (let redirectCount = 0; redirectCount <= MAX_REMOTE_REDIRECTS; redirectCount += 1) {
        current = await validateRemoteTarget(current.toString(), config);
        const response = await fetchImpl(current, {
            headers: {
                'Accept': 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.1'
            },
            redirect: 'manual'
        });
        if (response.status < 300 || response.status >= 400) {
            return response;
        }
        const location = response.headers.get('location');
        if (!location) {
            throw new Error('[Zenith:Image] Remote image redirect is missing a Location header');
        }
        current = new URL(location, current);
    }
    throw new Error('[Zenith:Image] Remote image redirected too many times');
}
