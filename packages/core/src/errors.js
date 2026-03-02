// ---------------------------------------------------------------------------
// errors.js — Zenith Core V0
// ---------------------------------------------------------------------------
// Shared error formatting. All Zenith errors use the format:
//   [Zenith:MODULE] message
//
// Pure factory functions. No side effects.
// ---------------------------------------------------------------------------

/**
 * Create a Zenith error with standard formatting.
 *
 * @param {string} module  Module name (e.g. 'Config', 'Path', 'Build')
 * @param {string} message  Error message
 * @returns {Error}
 */
export function createError(module, message) {
    const err = new Error(`[Zenith:${module}] ${message}`);
    err.zenithModule = module;
    return err;
}

/**
 * Format an error message with the Zenith prefix.
 *
 * @param {string} module
 * @param {string} message
 * @returns {string}
 */
export function formatError(module, message) {
    return `[Zenith:${module}] ${message}`;
}

/**
 * Check if an error is a Zenith error.
 *
 * @param {Error} err
 * @returns {boolean}
 */
export function isZenithError(err) {
    return err instanceof Error && typeof err.zenithModule === 'string';
}

/**
 * Predefined error codes for common situations.
 */
export const ErrorCodes = {
    CONFIG_UNKNOWN_KEY: 'CONFIG_UNKNOWN_KEY',
    CONFIG_INVALID_TYPE: 'CONFIG_INVALID_TYPE',
    CONFIG_EMPTY_VALUE: 'CONFIG_EMPTY_VALUE',
    PATH_REPEATED_PARAM: 'PATH_REPEATED_PARAM',
    VERSION_INCOMPATIBLE: 'VERSION_INCOMPATIBLE',
    GUARD_VIOLATION: 'GUARD_VIOLATION'
};
