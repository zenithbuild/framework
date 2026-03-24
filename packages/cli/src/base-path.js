const ROOT_BASE_PATH = '/';

function normalizeLeadingSlash(value) {
    const raw = String(value || '').trim();
    if (!raw) {
        return ROOT_BASE_PATH;
    }
    const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
    return withLeadingSlash.replace(/\/{2,}/g, '/');
}

export function normalizeBasePath(value) {
    const raw = String(value ?? ROOT_BASE_PATH).trim();
    if (!raw || raw === ROOT_BASE_PATH) {
        return ROOT_BASE_PATH;
    }
    if (raw.includes('?') || raw.includes('#')) {
        throw new Error('[Zenith:Config] Key "basePath" must not include query or hash fragments');
    }
    if (!raw.startsWith('/')) {
        throw new Error('[Zenith:Config] Key "basePath" must start with "/"');
    }

    const normalized = normalizeLeadingSlash(raw).replace(/\/+$/g, '');
    return normalized || ROOT_BASE_PATH;
}

export function normalizePublicPath(pathname) {
    const normalized = normalizeLeadingSlash(pathname);
    if (normalized.length > 1) {
        return normalized.replace(/\/+$/g, '');
    }
    return normalized;
}

export function prependBasePath(basePath, pathname = ROOT_BASE_PATH) {
    const normalizedBasePath = normalizeBasePath(basePath);
    const normalizedPath = normalizePublicPath(pathname);
    if (normalizedBasePath === ROOT_BASE_PATH) {
        return normalizedPath;
    }
    if (normalizedPath === ROOT_BASE_PATH) {
        return normalizedBasePath;
    }
    if (normalizedPath === normalizedBasePath || normalizedPath.startsWith(`${normalizedBasePath}/`)) {
        return normalizedPath;
    }
    return `${normalizedBasePath}${normalizedPath}`;
}

export function stripBasePath(pathname, basePath) {
    const normalizedBasePath = normalizeBasePath(basePath);
    const normalizedPath = normalizePublicPath(pathname);
    if (normalizedBasePath === ROOT_BASE_PATH) {
        return normalizedPath;
    }
    if (normalizedPath === normalizedBasePath) {
        return ROOT_BASE_PATH;
    }
    if (normalizedPath.startsWith(`${normalizedBasePath}/`)) {
        return normalizedPath.slice(normalizedBasePath.length) || ROOT_BASE_PATH;
    }
    return null;
}

export function isWithinBasePath(pathname, basePath) {
    return stripBasePath(pathname, basePath) !== null;
}

export function appLocalRedirectLocation(location, basePath) {
    const value = typeof location === 'string' ? location.trim() : '';
    if (!value || !value.startsWith('/') || value.startsWith('//')) {
        return value;
    }
    return prependBasePath(basePath, value);
}

export function routeCheckPath(basePath) {
    return prependBasePath(basePath, '/__zenith/route-check');
}

export function imageEndpointPath(basePath) {
    return prependBasePath(basePath, '/_zenith/image');
}
