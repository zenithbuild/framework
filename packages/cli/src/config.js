import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeImageConfig } from './images/shared.js';

export const DEFAULT_CONFIG = {
    router: false,
    embeddedMarkupExpressions: false,
    types: true,
    typescriptDefault: true,
    outDir: 'dist',
    pagesDir: 'pages',
    experimental: {},
    strictDomLints: false,
    images: normalizeImageConfig()
};

const TOP_LEVEL_SCHEMA = {
    router: 'boolean',
    embeddedMarkupExpressions: 'boolean',
    types: 'boolean',
    typescriptDefault: 'boolean',
    outDir: 'string',
    pagesDir: 'string',
    experimental: 'object',
    strictDomLints: 'boolean',
    images: 'object'
};

export function validateConfig(config) {
    if (config === null || config === undefined) {
        return { ...DEFAULT_CONFIG, images: normalizeImageConfig() };
    }
    if (typeof config !== 'object' || Array.isArray(config)) {
        throw new Error('[Zenith:Config] Config must be a plain object');
    }

    for (const key of Object.keys(config)) {
        if (!(key in TOP_LEVEL_SCHEMA)) {
            throw new Error(`[Zenith:Config] Unknown key: "${key}"`);
        }
    }

    const result = {
        ...DEFAULT_CONFIG,
        images: normalizeImageConfig(DEFAULT_CONFIG.images)
    };

    for (const [key, expectedType] of Object.entries(TOP_LEVEL_SCHEMA)) {
        if (!(key in config)) {
            continue;
        }
        const value = config[key];
        if (key === 'images') {
            result.images = normalizeImageConfig(value);
            continue;
        }
        if (expectedType === 'object') {
            if (typeof value !== 'object' || value === null || Array.isArray(value)) {
                throw new Error(`[Zenith:Config] Key "${key}" must be a plain object`);
            }
            result[key] = { ...value };
            continue;
        }
        if (typeof value !== expectedType) {
            throw new Error(`[Zenith:Config] Key "${key}" must be ${expectedType}, got ${typeof value}`);
        }
        if (expectedType === 'string' && value.trim().length === 0) {
            throw new Error(`[Zenith:Config] Key "${key}" must be a non-empty string`);
        }
        result[key] = value;
    }

    return result;
}

export async function loadConfig(projectRoot) {
    const configPath = join(projectRoot, 'zenith.config.js');
    try {
        const url = pathToFileURL(configPath).href;
        const mod = await import(url);
        return validateConfig(mod.default || mod);
    } catch (error) {
        const code = typeof error?.code === 'string' ? error.code : '';
        const message = typeof error?.message === 'string' ? error.message : '';
        if (
            code === 'ERR_MODULE_NOT_FOUND'
            || code === 'ENOENT'
            || message.includes('Cannot find module')
            || message.includes('ENOENT')
        ) {
            return validateConfig(null);
        }
        throw error;
    }
}
