// ---------------------------------------------------------------------------
// index.js — Zenith Core V0
// ---------------------------------------------------------------------------
// Public API. Re-exports frozen module namespaces only.
// ---------------------------------------------------------------------------

export { validateConfig, loadConfig, getDefaults } from './config.js';
export {
    normalizeSeparators,
    fileToRoute,
    extractParams,
    isDynamic,
    validateRouteParams,
    canonicalize
} from './path.js';
export { sortRoutes, sortAlpha, isCorrectOrder } from './order.js';
export { hash, hashShort } from './hash.js';
export { createError, formatError, isZenithError, ErrorCodes } from './errors.js';
export { parseSemver, formatVersion, validateCompatibility } from './version.js';
export { IR_VERSION, IR_SCHEMA } from './schema.js';
export { coreModuleSource } from './core-template.js';
export {
    containsForbiddenPattern,
    FORBIDDEN_PATTERNS,
    BROWSER_GLOBALS
} from './guards.js';
