// Emitted as server/images/service.js when @zenithbuild/image is not installed.
// It answers /_zenith/image exactly as the full image service does for every
// request that service rejects before fetching or transforming anything:
// missing url, invalid width, invalid URL, remote URL outside
// images.remotePatterns, loopback/local-network hosts, hostnames that fail to
// resolve or resolve to a private address, and non-http(s) protocols. Only
// requests the full service would actually fetch get the missing-package
// error. It never imports sharp or the image package. The relative import
// resolves to the emitted server/image-config.js.
//
// The URL-pattern and network-address functions below are verbatim copies of
// @zenithbuild/image's shared.js and remote-fetch.js (asserted by
// tests/image-service-unavailable.spec.js), because the package is absent
// wherever this file runs.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { normalizeImageConfig } from '../image-config.js';

const MISSING_PACKAGE_MESSAGE =
    '[Zenith:Image] Remote image optimization requires @zenithbuild/image. Install it and rebuild.';

function escapeRegex(value) {
    return String(value).replace(/[|\\{}()[\]^$+?.*]/g, '\\$&');
}

function globToRegExp(glob, isHostname = false) {
    let pattern = escapeRegex(glob);
    pattern = pattern.replaceAll('\\*\\*', '__DOUBLE_STAR__');
    pattern = pattern.replaceAll('\\*', isHostname ? '[^.]*' : '[^/]*');
    pattern = pattern.replaceAll('__DOUBLE_STAR__', '.*');
    return new RegExp(`^${pattern}$`, 'i');
}

function hostnameMatches(hostname, pattern) {
    if (pattern.startsWith('*.')) {
        const suffix = pattern.slice(1);
        return hostname.endsWith(suffix) && hostname.length > suffix.length;
    }
    return globToRegExp(pattern, true).test(hostname);
}

function matchRemotePattern(inputUrl, patterns) {
    if (!inputUrl || !Array.isArray(patterns) || patterns.length === 0) {
        return false;
    }
    const url = inputUrl instanceof URL ? inputUrl : new URL(String(inputUrl));
    const protocol = url.protocol.replace(/:$/, '').toLowerCase();
    const hostname = url.hostname.toLowerCase();
    const port = url.port || '';
    const pathname = url.pathname || '/';
    const search = url.search || '';

    return patterns.some((pattern) => {
        if (pattern.protocol && pattern.protocol !== protocol) {
            return false;
        }
        if (!hostnameMatches(hostname, pattern.hostname || '')) {
            return false;
        }
        if (pattern.port && pattern.port !== port) {
            return false;
        }
        if (pattern.search && pattern.search !== search) {
            return false;
        }
        return globToRegExp(pattern.pathname || '/**').test(pathname);
    });
}

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

function isLocalNetworkAddress(address) {
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

async function resolveRemoteTarget(remoteUrl, config, lookupImpl = lookup) {
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

function createJsonResponse(status, payload) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            'Content-Type': 'application/json'
        }
    });
}

async function sendResponse(res, response) {
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    const body = await response.arrayBuffer();
    res.end(Buffer.from(body));
}

async function createImageResponse(options) {
    const {
        requestUrl,
        config: rawConfig
    } = options;
    const config = normalizeImageConfig(rawConfig);
    const url = requestUrl instanceof URL ? requestUrl : new URL(String(requestUrl));
    const remoteUrl = url.searchParams.get('url');
    const width = Number.parseInt(url.searchParams.get('w') || '', 10);

    if (!remoteUrl) {
        return createJsonResponse(400, { error: 'missing_url' });
    }
    if (!Number.isInteger(width) || width <= 0) {
        return createJsonResponse(400, { error: 'invalid_width' });
    }

    // options.lookup replaces DNS resolution in tests only; the full service
    // has no such option and ignores it.
    const lookupImpl = typeof options.lookup === 'function' ? options.lookup : lookup;
    try {
        // Same order as the full service: validateRemoteTarget(), then
        // fetchRemoteImage() resolving the target again and building the
        // request (protocol check) before any network I/O.
        const remote = (await resolveRemoteTarget(remoteUrl, config, lookupImpl)).url;
        const target = await resolveRemoteTarget(remote.toString(), config, lookupImpl);
        if (target.url.protocol !== 'http:' && target.url.protocol !== 'https:') {
            throw new Error('[Zenith:Image] Remote image protocol must be http or https');
        }
        throw new Error(MISSING_PACKAGE_MESSAGE);
    } catch (error) {
        return createJsonResponse(400, {
            error: 'image_request_failed',
            // Realm-independent form of base's `error instanceof Error`; every
            // error thrown above is an Error, so the payload is identical.
            message: typeof error?.message === 'string' ? error.message : String(error)
        });
    }
}

/**
 * @param {Request | { url?: string } | null | undefined} request
 * @param {{ requestUrl?: URL | string, projectRoot?: string, config?: Record<string, unknown> }} options
 * @returns {Promise<Response>}
 */
export async function handleImageFetchRequest(request, options) {
    return createImageResponse({
        ...options,
        requestUrl: request?.url || options?.requestUrl
    });
}

export async function handleImageRequest(_req, res, options) {
    const response = await createImageResponse(options);
    await sendResponse(res, response);
    return true;
}
