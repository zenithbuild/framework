export function defaultRouteDenyMessage(status) {
    if (status === 401) return 'Unauthorized';
    if (status === 403) return 'Forbidden';
    if (status === 404) return 'Not Found';
    return 'Internal Server Error';
}

export function clientFacingRouteMessage(status, message) {
    const resolvedStatus = Number.isInteger(status) ? status : 500;
    if (resolvedStatus >= 500) {
        return defaultRouteDenyMessage(resolvedStatus);
    }
    const resolvedMessage = typeof message === 'string' ? message : '';
    return resolvedMessage || defaultRouteDenyMessage(resolvedStatus);
}

export function sanitizeRouteResult(result) {
    if (!result || typeof result !== 'object' || Array.isArray(result) || result.kind !== 'deny') {
        return result;
    }

    const status = Number.isInteger(result.status) ? result.status : 403;
    return {
        ...result,
        status,
        message: clientFacingRouteMessage(status, result.message)
    };
}

export function logServerException(scope, error) {
    const details = error instanceof Error
        ? (typeof error.stack === 'string' && error.stack.length > 0 ? error.stack : error.message)
        : String(error);
    console.error(`[Zenith:Server] ${scope}\n${details}`);
}
