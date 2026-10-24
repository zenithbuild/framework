import { normalizeBasePath } from './base-path.js';

const DEFAULT_DEVICE_SIZES = [640, 750, 828, 1080, 1200, 1920, 2048, 3840];
const DEFAULT_IMAGE_SIZES = [16, 32, 48, 64, 96, 128, 256, 384];
const DEFAULT_FORMATS = ['webp', 'avif'];
const DEFAULT_REMOTE_PATTERNS = [];
const DEFAULT_MAX_REMOTE_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_PIXELS = 40_000_000;
const DEFAULT_MINIMUM_CACHE_TTL = 60;
const DEFAULT_QUALITY = 75;

export const DEFAULT_IMAGE_CONFIG = {
    formats: DEFAULT_FORMATS,
    quality: DEFAULT_QUALITY,
    deviceSizes: DEFAULT_DEVICE_SIZES,
    imageSizes: DEFAULT_IMAGE_SIZES,
    remotePatterns: DEFAULT_REMOTE_PATTERNS,
    allowSvg: false,
    maxRemoteBytes: DEFAULT_MAX_REMOTE_BYTES,
    maxPixels: DEFAULT_MAX_PIXELS,
    minimumCacheTTL: DEFAULT_MINIMUM_CACHE_TTL,
    dangerouslyAllowLocalNetwork: false
};

const TOP_LEVEL_KEYS = new Set([
    'formats',
    'quality',
    'deviceSizes',
    'imageSizes',
    'remotePatterns',
    'allowSvg',
    'maxRemoteBytes',
    'maxPixels',
    'minimumCacheTTL',
    'dangerouslyAllowLocalNetwork'
]);

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asPositiveInt(value, key) {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`[Zenith:Config] images.${key} must be a positive integer`);
    }
    return value;
}

function normalizeStringArray(value, key) {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error(`[Zenith:Config] images.${key} must be a non-empty array`);
    }
    const out = [];
    for (const entry of value) {
        if (typeof entry !== 'string' || entry.trim().length === 0) {
            throw new Error(`[Zenith:Config] images.${key} must contain non-empty strings`);
        }
        out.push(entry.trim().toLowerCase());
    }
    return [...new Set(out)];
}

function normalizePositiveIntArray(value, key) {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error(`[Zenith:Config] images.${key} must be a non-empty array`);
    }
    const out = [];
    for (const entry of value) {
        out.push(asPositiveInt(entry, key));
    }
    return [...new Set(out)].sort((left, right) => left - right);
}

function normalizeRemotePattern(pattern) {
    if (!isPlainObject(pattern)) {
        throw new Error('[Zenith:Config] images.remotePatterns must contain plain objects');
    }
    const protocol = typeof pattern.protocol === 'string' && pattern.protocol.trim().length > 0
        ? pattern.protocol.trim().replace(/:$/, '').toLowerCase()
        : 'https';
    const hostname = typeof pattern.hostname === 'string' ? pattern.hostname.trim().toLowerCase() : '';
    if (!hostname) {
        throw new Error('[Zenith:Config] images.remotePatterns[].hostname is required');
    }
    const port = typeof pattern.port === 'string' ? pattern.port.trim() : '';
    const pathname = typeof pattern.pathname === 'string' && pattern.pathname.trim().length > 0
        ? pattern.pathname.trim()
        : '/**';
    const search = typeof pattern.search === 'string' && pattern.search.length > 0
        ? pattern.search
        : '';
    return {
        protocol,
        hostname,
        port,
        pathname,
        search
    };
}

function cloneImageConfig(config = DEFAULT_IMAGE_CONFIG) {
    return {
        ...config,
        formats: [...(config.formats || [])],
        deviceSizes: [...(config.deviceSizes || [])],
        imageSizes: [...(config.imageSizes || [])],
        remotePatterns: Array.isArray(config.remotePatterns)
            ? config.remotePatterns.map((pattern) => ({ ...pattern }))
            : []
    };
}

export function normalizeImageConfig(input) {
    if (input === undefined || input === null) {
        return cloneImageConfig(DEFAULT_IMAGE_CONFIG);
    }
    if (!isPlainObject(input)) {
        throw new Error('[Zenith:Config] images must be a plain object');
    }

    for (const key of Object.keys(input)) {
        if (!TOP_LEVEL_KEYS.has(key)) {
            throw new Error(`[Zenith:Config] Unknown key: "images.${key}"`);
        }
    }

    const config = cloneImageConfig(DEFAULT_IMAGE_CONFIG);

    if ('formats' in input) {
        config.formats = normalizeStringArray(input.formats, 'formats');
    }
    if ('quality' in input) {
        config.quality = asPositiveInt(input.quality, 'quality');
    }
    if ('deviceSizes' in input) {
        config.deviceSizes = normalizePositiveIntArray(input.deviceSizes, 'deviceSizes');
    }
    if ('imageSizes' in input) {
        config.imageSizes = normalizePositiveIntArray(input.imageSizes, 'imageSizes');
    }
    if ('remotePatterns' in input) {
        if (!Array.isArray(input.remotePatterns)) {
            throw new Error('[Zenith:Config] images.remotePatterns must be an array');
        }
        config.remotePatterns = input.remotePatterns.map(normalizeRemotePattern);
    }
    if ('allowSvg' in input) {
        if (typeof input.allowSvg !== 'boolean') {
            throw new Error('[Zenith:Config] images.allowSvg must be boolean');
        }
        config.allowSvg = input.allowSvg;
    }
    if ('maxRemoteBytes' in input) {
        config.maxRemoteBytes = asPositiveInt(input.maxRemoteBytes, 'maxRemoteBytes');
    }
    if ('maxPixels' in input) {
        config.maxPixels = asPositiveInt(input.maxPixels, 'maxPixels');
    }
    if ('minimumCacheTTL' in input) {
        config.minimumCacheTTL = asPositiveInt(input.minimumCacheTTL, 'minimumCacheTTL');
    }
    if ('dangerouslyAllowLocalNetwork' in input) {
        if (typeof input.dangerouslyAllowLocalNetwork !== 'boolean') {
            throw new Error('[Zenith:Config] images.dangerouslyAllowLocalNetwork must be boolean');
        }
        config.dangerouslyAllowLocalNetwork = input.dangerouslyAllowLocalNetwork;
    }

    return config;
}


// Image runtime payload contract. It lives with the image config so the CLI
// emits the same `zenith-image-runtime` script whether or not the optional
// image package is installed (JUD-83 output parity).
const IMAGE_RUNTIME_GLOBAL = '__zenith_image_runtime';
const IMAGE_RUNTIME_MARKER_RE = /data-zx-(data-zenith-image|unsafeHTML)/;

export function imageRuntimeGlobalName() {
    return IMAGE_RUNTIME_GLOBAL;
}

export function htmlNeedsImageRuntimePayload(html) {
    return IMAGE_RUNTIME_MARKER_RE.test(String(html || ''));
}

export function normalizeImageRuntimePayload(payload) {
    if (!isPlainObject(payload)) {
        return null;
    }
    return {
        mode: payload.mode === 'endpoint' ? 'endpoint' : 'passthrough',
        basePath: normalizeBasePath(payload.basePath || '/'),
        config: normalizeImageConfig(payload.config || {}),
        localImages: isPlainObject(payload.localImages) ? payload.localImages : {}
    };
}

export function createImageRuntimePayload(config, localImages, mode = 'passthrough', basePath = '/') {
    return normalizeImageRuntimePayload({
        mode,
        basePath,
        config: normalizeImageConfig(config),
        localImages: localImages && typeof localImages === 'object' ? localImages : {}
    });
}

function serializeInlineScriptJson(payload) {
    return JSON.stringify(payload)
        .replace(/</g, '\\u003C')
        .replace(/>/g, '\\u003E')
        .replace(/\//g, '\\u002F')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

export function injectImageRuntimePayload(html, payload) {
    // Only inject if the HTML contains Zenith image markers or unsafeHTML
    if (!htmlNeedsImageRuntimePayload(html)) {
        return html;
    }

    const safePayload = createImageRuntimePayload(
        payload?.config || {},
        payload?.localImages || {},
        payload?.mode || 'passthrough',
        payload?.basePath || '/'
    );
    const globalName = imageRuntimeGlobalName();
    const serialized = serializeInlineScriptJson(safePayload);
    const scriptTag = `<script id="zenith-image-runtime">window.${globalName} = ${serialized};</script>`;
    const existingTagRe = /<script\b[^>]*\bid=(["'])zenith-image-runtime\1[^>]*>[\s\S]*?<\/script>/i;

    if (existingTagRe.test(html)) {
        return html.replace(existingTagRe, scriptTag);
    }
    if (/<\/head>/i.test(html)) {
        return html.replace(/<\/head>/i, `${scriptTag}</head>`);
    }
    const bodyOpen = html.match(/<body\b[^>]*>/i);
    if (bodyOpen) {
        return html.replace(bodyOpen[0], `${bodyOpen[0]}${scriptTag}`);
    }
    return `${scriptTag}${html}`;
}
