// ---------------------------------------------------------------------------
// guards.js — Zenith Core V0
// ---------------------------------------------------------------------------
// Small pure validation helpers. These provide primitives —
// they do NOT scan repos, enforce architecture, or police other layers.
// ---------------------------------------------------------------------------

/**
 * Check if source contains any of the given forbidden patterns.
 *
 * @param {string} source  Source code text
 * @param {string[]} patterns  Patterns to check for
 * @returns {string[]}  Array of matched patterns (empty if none)
 */
export function containsForbiddenPattern(source, patterns) {
    const found = [];
    for (const pattern of patterns) {
        if (source.includes(pattern)) {
            found.push(pattern);
        }
    }
    return found;
}

/**
 * Validate that a route path has no repeated parameter names.
 * Re-exported from path.js for convenience.
 *
 * @param {string} routePath
 */
export { validateRouteParams } from './path.js';

/**
 * Validate a config object against the V0 schema.
 * Re-exported from config.js for convenience.
 *
 * @param {object} config
 * @returns {object}
 */
export { validateConfig as validateConfigSchema } from './config.js';

/**
 * Default forbidden patterns for Zenith source code.
 */
export const FORBIDDEN_PATTERNS = [
    'eval(',
    'new Function(',
    'new Function (',
    'document.write('
];

/**
 * Default browser globals that should not appear in Node-only code.
 */
export const BROWSER_GLOBALS = [
    'window',
    'document',
    'navigator',
    'localStorage',
    'sessionStorage'
];
