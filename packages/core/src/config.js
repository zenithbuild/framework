// ---------------------------------------------------------------------------
// config.js — Zenith Core V0
// ---------------------------------------------------------------------------
// Load and validate zenith.config.js. This is the ONLY module in core
// that touches the filesystem (via dynamic import).
//
// V0 Schema: { router, outDir, pagesDir }
// Unknown keys → throw.
// ---------------------------------------------------------------------------

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** V0 config defaults */
const DEFAULTS = {
    router: false,
    embeddedMarkupExpressions: false,
    types: true,
    typescriptDefault: true,
    outDir: 'dist',
    pagesDir: 'pages',
    experimental: {},
    strictDomLints: false
};

/** Allowed keys and their expected types */
const SCHEMA = {
    router: 'boolean',
    embeddedMarkupExpressions: 'boolean',
    types: 'boolean',
    typescriptDefault: 'boolean',
    outDir: 'string',
    pagesDir: 'string',
    experimental: 'object',
    strictDomLints: 'boolean'
};

/**
 * Validate a config object against the V0 schema.
 * Throws on unknown keys or wrong types.
 *
 * @param {object} config
 * @returns {object} Normalized config with defaults applied
 */
export function validateConfig(config) {
    if (config === null || config === undefined) {
        return { ...DEFAULTS };
    }

    if (typeof config !== 'object' || Array.isArray(config)) {
        throw new Error('[Zenith:Config] Config must be a plain object');
    }

    // Check for unknown keys
    for (const key of Object.keys(config)) {
        if (!(key in SCHEMA)) {
            throw new Error(`[Zenith:Config] Unknown key: "${key}"`);
        }
    }

    // Validate types and apply defaults
    const result = { ...DEFAULTS };

    for (const [key, expectedType] of Object.entries(SCHEMA)) {
        if (key in config) {
            const value = config[key];
            if (typeof value !== expectedType) {
                throw new Error(
                    `[Zenith:Config] Key "${key}" must be ${expectedType}, got ${typeof value}`
                );
            }
            if (expectedType === 'string' && value.trim() === '') {
                throw new Error(
                    `[Zenith:Config] Key "${key}" must be a non-empty string`
                );
            }
            if (key === 'experimental' && value) {
                if (typeof value !== 'object' || Array.isArray(value)) {
                    throw new Error(`[Zenith:Config] Key "experimental" must be a plain object`);
                }
                const expDefaults = { ...DEFAULTS.experimental };
                for (const expKey of Object.keys(value)) {
                    if (!(expKey in expDefaults)) {
                        throw new Error(`[Zenith:Config] Unknown experimental key: "${expKey}"`);
                    }
                    if (typeof value[expKey] !== typeof expDefaults[expKey]) {
                        throw new Error(`[Zenith:Config] Experimental key "${expKey}" must be ${typeof expDefaults[expKey]}`);
                    }
                    expDefaults[expKey] = value[expKey];
                }
                result[key] = expDefaults;
                continue;
            }
            result[key] = value;
        }
    }

    return result;
}

/**
 * Load zenith.config.js from a project root.
 * Returns validated config with defaults applied.
 *
 * @param {string} projectRoot
 * @returns {Promise<object>}
 */
export async function loadConfig(projectRoot) {
    const configPath = join(projectRoot, 'zenith.config.js');

    try {
        const url = pathToFileURL(configPath).href;
        const mod = await import(url);
        const raw = mod.default || mod;
        return validateConfig(raw);
    } catch (err) {
        // File not found — return defaults
        if (
            err.code === 'ERR_MODULE_NOT_FOUND' ||
            err.code === 'ENOENT' ||
            err.message?.includes('Cannot find module') ||
            err.message?.includes('ENOENT')
        ) {
            return { ...DEFAULTS };
        }
        throw err;
    }
}

/**
 * Return the default config.
 * @returns {object}
 */
export function getDefaults() {
    return { ...DEFAULTS };
}
