import { imageEndpointPath, prependBasePath } from '@zenithbuild/config/base-path';

import {
    DEFAULT_IMAGE_CONFIG,
    imageRuntimeGlobalName,
    normalizeImageConfig,
    normalizeImageRuntimePayload
} from '@zenithbuild/config/images';
export { DEFAULT_IMAGE_CONFIG, imageRuntimeGlobalName, normalizeImageConfig, normalizeImageRuntimePayload };
const DEFAULT_DEVICE_SIZES = DEFAULT_IMAGE_CONFIG.deviceSizes;
const DEFAULT_IMAGE_SIZES = DEFAULT_IMAGE_CONFIG.imageSizes;
function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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

export function buildLocalVariantAssetPath(publicPath, width, quality, format) {
    const key = buildLocalImageKey(publicPath);
    return `/_zenith/image/local/${key}/w${width}-q${quality}.${normalizeImageFormat(format)}`;
}

export function buildLocalVariantPath(publicPath, width, quality, format, basePath = '/') {
    return prependBasePath(basePath, buildLocalVariantAssetPath(publicPath, width, quality, format));
}

export function buildRemoteVariantPath(remoteUrl, width, quality, format, basePath = '/') {
    const query = new URLSearchParams();
    query.set('url', String(remoteUrl || ''));
    query.set('w', String(width));
    query.set('q', String(quality));
    if (format) {
        query.set('f', normalizeImageFormat(format));
    }
    return `${imageEndpointPath(basePath)}?${query.toString()}`;
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
