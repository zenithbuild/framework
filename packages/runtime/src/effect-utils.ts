// @ts-nocheck

const DEFAULT_EFFECT_OPTIONS = {
    debounceMs: 0,
    throttleMs: 0,
    raf: false,
    flush: 'post'
};

export function normalizeDelay(value, fieldName) {
    if (value === undefined || value === null) {
        return 0;
    }
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(
            `[Zenith Runtime] zenEffect options.${fieldName} must be a non-negative number`
        );
    }
    return Math.floor(value);
}

export function normalizeEffectOptions(options) {
    if (options === undefined || options === null) {
        return DEFAULT_EFFECT_OPTIONS;
    }

    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw new Error('[Zenith Runtime] zenEffect(effect, options) requires options object when provided');
    }

    const normalized = {
        debounceMs: normalizeDelay(options.debounceMs, 'debounceMs'),
        throttleMs: normalizeDelay(options.throttleMs, 'throttleMs'),
        raf: options.raf === true,
        flush: options.flush === 'sync' ? 'sync' : 'post'
    };

    if (options.flush !== undefined && options.flush !== 'sync' && options.flush !== 'post') {
        throw new Error('[Zenith Runtime] zenEffect options.flush must be "post" or "sync"');
    }

    const schedulingModes =
        (normalized.debounceMs > 0 ? 1 : 0) +
        (normalized.throttleMs > 0 ? 1 : 0) +
        (normalized.raf ? 1 : 0);

    if (schedulingModes > 1) {
        throw new Error('[Zenith Runtime] zenEffect options may use only one scheduler: debounceMs, throttleMs, or raf');
    }

    return normalized;
}

export function drainCleanupStack(cleanups, errors = null) {
    const errorSink = Array.isArray(errors) ? errors : null;
    for (let i = cleanups.length - 1; i >= 0; i--) {
        const cleanup = cleanups[i];
        if (typeof cleanup !== 'function') {
            continue;
        }
        try {
            cleanup();
        } catch (error) {
            if (errorSink) {
                errorSink.push(error);
            }
        }
    }
    cleanups.length = 0;
}

export function runCleanupCallback(callback, errors = null) {
    try {
        callback();
    } catch (error) {
        if (Array.isArray(errors)) {
            errors.push(error);
        }
    }
}

export function throwCleanupErrors(errors, label = 'cleanup') {
    if (!Array.isArray(errors) || errors.length === 0) {
        return;
    }

    const message = `[Zenith Runtime] ${label} failed with ${errors.length} error(s)`;
    const error = typeof AggregateError === 'function'
        ? new AggregateError(errors, message)
        : new Error(message);
    error.zenithCleanupErrors = errors;
    throw error;
}

export function applyCleanupResult(result, registerCleanup) {
    if (typeof result === 'function') {
        registerCleanup(result);
        return;
    }

    if (result && typeof result === 'object' && typeof result.cleanup === 'function') {
        registerCleanup(result.cleanup);
    }
}

function requireFunction(callback, label) {
    if (typeof callback !== 'function') {
        throw new Error(`[Zenith Runtime] ${label} requires callback function`);
    }
}

export function createMountContext(registerCleanup) {
    return {
        cleanup: registerCleanup
    };
}

export function createEffectContext(registerCleanup) {
    return {
        cleanup: registerCleanup,
        timeout(callback, delayMs = 0) {
            requireFunction(callback, 'zenEffect context.timeout(callback, delayMs)');
            const timeoutId = setTimeout(callback, normalizeDelay(delayMs, 'timeout'));
            registerCleanup(() => clearTimeout(timeoutId));
            return timeoutId;
        },
        raf(callback) {
            requireFunction(callback, 'zenEffect context.raf(callback)');
            if (typeof requestAnimationFrame === 'function') {
                const frameId = requestAnimationFrame(callback);
                registerCleanup(() => cancelAnimationFrame(frameId));
                return frameId;
            }
            const timeoutId = setTimeout(callback, 16);
            registerCleanup(() => clearTimeout(timeoutId));
            return timeoutId;
        },
        debounce(callback, delayMs) {
            requireFunction(callback, 'zenEffect context.debounce(callback, delayMs)');
            const waitMs = normalizeDelay(delayMs, 'debounce');
            let timeoutId = null;

            const wrapped = (...args) => {
                if (timeoutId !== null) {
                    clearTimeout(timeoutId);
                }
                timeoutId = setTimeout(() => {
                    timeoutId = null;
                    callback(...args);
                }, waitMs);
            };

            registerCleanup(() => {
                if (timeoutId !== null) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
            });

            return wrapped;
        },
        throttle(callback, delayMs) {
            requireFunction(callback, 'zenEffect context.throttle(callback, delayMs)');
            const waitMs = normalizeDelay(delayMs, 'throttle');
            let timeoutId = null;
            let lastRun = 0;
            let pendingArgs = null;

            const invoke = (args) => {
                lastRun = Date.now();
                callback(...args);
            };

            const wrapped = (...args) => {
                const now = Date.now();
                const elapsed = now - lastRun;
                if (lastRun === 0 || elapsed >= waitMs) {
                    if (timeoutId !== null) {
                        clearTimeout(timeoutId);
                        timeoutId = null;
                    }
                    pendingArgs = null;
                    invoke(args);
                    return;
                }

                pendingArgs = args;
                if (timeoutId !== null) {
                    return;
                }

                timeoutId = setTimeout(() => {
                    timeoutId = null;
                    if (pendingArgs) {
                        const next = pendingArgs;
                        pendingArgs = null;
                        invoke(next);
                    }
                }, waitMs - elapsed);
            };

            registerCleanup(() => {
                if (timeoutId !== null) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
                pendingArgs = null;
            });

            return wrapped;
        }
    };
}
