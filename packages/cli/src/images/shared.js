const DEFAULT_DEVICE_SIZES = [640, 750, 828, 1080, 1200, 1920, 2048, 3840];
const DEFAULT_IMAGE_SIZES = [16, 32, 48, 64, 96, 128, 256, 384];
const DEFAULT_FORMATS = ['webp', 'avif'];
const DEFAULT_REMOTE_PATTERNS = [];
const DEFAULT_MAX_REMOTE_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_PIXELS = 40_000_000;
const DEFAULT_MINIMUM_CACHE_TTL = 60;
const DEFAULT_QUALITY = 75;
const IMAGE_RUNTIME_GLOBAL = '__zenith_image_runtime';

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

export function matchRemotePattern(inputUrl, patterns) {
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

export function isRemoteImageUrl(value) {
    if (typeof value !== 'string') {
        return false;
    }
    return /^https?:\/\//i.test(value.trim());
}

export function normalizeImageSource(input) {
    if (typeof input === 'string') {
        const trimmed = input.trim();
        if (!trimmed) {
            return null;
        }
        if (isRemoteImageUrl(trimmed)) {
            return { kind: 'remote', url: trimmed, width: null, height: null, alt: '' };
        }
        if (trimmed.startsWith('/')) {
            return { kind: 'local', path: trimmed, width: null, height: null, alt: '' };
        }
        return null;
    }

    if (!isPlainObject(input)) {
        return null;
    }

    const rawUrl = typeof input.url === 'string'
        ? input.url
        : typeof input.src === 'string'
            ? input.src
            : typeof input.path === 'string'
                ? input.path
                : '';
    const normalized = normalizeImageSource(rawUrl);
    if (!normalized) {
        return null;
    }
    const width = Number.isInteger(input.width) && input.width > 0 ? input.width : null;
    const height = Number.isInteger(input.height) && input.height > 0 ? input.height : null;
    const alt = typeof input.alt === 'string' ? input.alt : '';
    return {
        ...normalized,
        width,
        height,
        alt
    };
}

export function normalizeImageFormat(value) {
    return String(value || '').trim().toLowerCase().replace(/^\./, '');
}

export function buildLocalImageKey(publicPath) {
    const input = String(publicPath || '');
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

export function buildLocalVariantPath(publicPath, width, quality, format) {
    const key = buildLocalImageKey(publicPath);
    return `/_zenith/image/local/${key}/w${width}-q${quality}.${normalizeImageFormat(format)}`;
}

export function buildRemoteVariantPath(remoteUrl, width, quality, format) {
    const query = new URLSearchParams();
    query.set('url', String(remoteUrl || ''));
    query.set('w', String(width));
    query.set('q', String(quality));
    if (format) {
        query.set('f', normalizeImageFormat(format));
    }
    return `/_zenith/image?${query.toString()}`;
}

export function resolveWidthCandidates(width, sizes, config, manifestEntry) {
    const base = new Set([
        ...(config?.deviceSizes || DEFAULT_DEVICE_SIZES),
        ...(config?.imageSizes || DEFAULT_IMAGE_SIZES)
    ]);
    if (Number.isInteger(width) && width > 0) {
        base.add(width);
        base.add(width * 2);
    }
    if (!width && typeof sizes === 'string' && sizes.trim().length > 0) {
        for (const candidate of config?.deviceSizes || DEFAULT_DEVICE_SIZES) {
            base.add(candidate);
        }
    }

    let widths = [...base].filter((entry) => Number.isInteger(entry) && entry > 0).sort((left, right) => left - right);
    const available = Array.isArray(manifestEntry?.availableWidths) ? manifestEntry.availableWidths : null;
    if (available && available.length > 0) {
        widths = widths.filter((entry) => available.includes(entry));
        if (widths.length === 0) {
            widths = [...available];
        }
    }
    return widths;
}

export function imageRuntimeGlobalName() {
    return IMAGE_RUNTIME_GLOBAL;
}

export function normalizeImageRuntimePayload(payload) {
    if (!isPlainObject(payload)) {
        return null;
    }
    return {
        mode: payload.mode === 'endpoint' ? 'endpoint' : 'passthrough',
        config: normalizeImageConfig(payload.config || {}),
        localImages: isPlainObject(payload.localImages) ? payload.localImages : {}
    };
}
