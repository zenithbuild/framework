// Emitted as server/images/service.js when @zenithbuild/image is not installed.
// It answers /_zenith/image exactly as the full image service does for every
// request that service rejects before fetching or transforming anything
// (missing url, invalid width, invalid URL, remote URL outside
// images.remotePatterns). It never imports sharp or the image package.
// The import resolves to the emitted server/image-config.js.
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

    try {
        const remote = new URL(remoteUrl);
        if (!matchRemotePattern(remote, config.remotePatterns)) {
            throw new Error('[Zenith:Image] Remote URL is not allowed by images.remotePatterns');
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
