const DEFAULT_HOST = '127.0.0.1';

export function publicHost(host) {
    const normalized = String(host || DEFAULT_HOST).trim() || DEFAULT_HOST;
    if (normalized === '0.0.0.0' || normalized === '::') {
        return DEFAULT_HOST;
    }
    return normalized;
}

function normalizePublicOrigin(value, label) {
    const raw = String(value || '').trim();
    if (!raw) {
        throw new Error(`[Zenith:Server] ${label} must be a non-empty absolute origin`);
    }

    let parsed;
    try {
        parsed = new URL(raw);
    } catch {
        throw new Error(`[Zenith:Server] ${label} must be an absolute origin`);
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`[Zenith:Server] ${label} must use http or https`);
    }

    if (parsed.username || parsed.password) {
        throw new Error(`[Zenith:Server] ${label} must not include credentials`);
    }

    if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
        throw new Error(`[Zenith:Server] ${label} must not include a path, query, or hash`);
    }

    return parsed.origin;
}

export function createTrustedOriginResolver(options = {}) {
    const {
        publicOrigin = undefined,
        host = DEFAULT_HOST,
        port = undefined,
        getPort = undefined,
        label = 'server'
    } = options;

    if (publicOrigin !== undefined && publicOrigin !== null && String(publicOrigin).trim().length > 0) {
        const origin = normalizePublicOrigin(publicOrigin, `${label} publicOrigin`);
        return () => origin;
    }

    return () => {
        const resolvedPort = typeof getPort === 'function' ? getPort() : port;
        if (!Number.isInteger(resolvedPort) || resolvedPort <= 0) {
            throw new Error(
                `[Zenith:Server] ${label} requires "publicOrigin" when a trusted port is unavailable; raw Host headers are not trusted`
            );
        }
        return `http://${publicHost(host)}:${resolvedPort}`;
    };
}
