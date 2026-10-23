const WITH_MIDDLEWARE_PREFIX = '[Zenith] withMiddleware(handler, ...middleware)';

function assertFunction(value, message) {
    if (typeof value !== 'function') {
        throw new Error(message);
    }
}

/**
 * Compose route middleware left-to-right:
 * withMiddleware(handler, a, b) === a(b(handler))
 *
 * @template {(ctx: unknown) => unknown} T
 * @param {T} handler
 * @param {...((next: T) => T)} middleware
 * @returns {T}
 */
export function withMiddleware(handler, ...middleware) {
    assertFunction(handler, `${WITH_MIDDLEWARE_PREFIX}: handler must be a function.`);
    if (middleware.length === 0) {
        return handler;
    }

    let composed = handler;
    for (let index = middleware.length - 1; index >= 0; index -= 1) {
        const candidate = middleware[index];
        assertFunction(
            candidate,
            `${WITH_MIDDLEWARE_PREFIX}: middleware at index ${index} must be a function.`
        );
        const wrapped = candidate(composed);
        assertFunction(
            wrapped,
            `${WITH_MIDDLEWARE_PREFIX}: middleware at index ${index} must return a function.`
        );
        composed = wrapped;
    }

    return /** @type {T} */ (composed);
}
