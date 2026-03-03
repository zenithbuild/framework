import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface ZenithConfig {
    router: boolean;
    embeddedMarkupExpressions: boolean;
    types: boolean;
    typescriptDefault: boolean;
    outDir: string;
    pagesDir: string;
    experimental: Record<string, never>;
    strictDomLints: boolean;
}

type ConfigInput = Partial<ZenithConfig> | null | undefined;

const DEFAULTS: ZenithConfig = {
    router: false,
    embeddedMarkupExpressions: false,
    types: true,
    typescriptDefault: true,
    outDir: 'dist',
    pagesDir: 'pages',
    experimental: {},
    strictDomLints: false
};

const SCHEMA: Record<keyof ZenithConfig, string> = {
    router: 'boolean',
    embeddedMarkupExpressions: 'boolean',
    types: 'boolean',
    typescriptDefault: 'boolean',
    outDir: 'string',
    pagesDir: 'string',
    experimental: 'object',
    strictDomLints: 'boolean'
};

export function validateConfig(config: ConfigInput): ZenithConfig {
    if (config === null || config === undefined) {
        return { ...DEFAULTS };
    }

    if (typeof config !== 'object' || Array.isArray(config)) {
        throw new Error('[Zenith:Config] Config must be a plain object');
    }

    for (const key of Object.keys(config)) {
        if (!(key in SCHEMA)) {
            throw new Error(`[Zenith:Config] Unknown key: "${key}"`);
        }
    }

    const result: ZenithConfig = { ...DEFAULTS };

    for (const [key, expectedType] of Object.entries(SCHEMA) as Array<[keyof ZenithConfig, string]>) {
        if (key in config) {
            const value = config[key];
            if (typeof value !== expectedType) {
                throw new Error(
                    `[Zenith:Config] Key "${key}" must be ${expectedType}, got ${typeof value}`
                );
            }
            if (expectedType === 'string' && typeof value === 'string' && value.trim() === '') {
                throw new Error(
                    `[Zenith:Config] Key "${key}" must be a non-empty string`
                );
            }
            if (key === 'experimental' && value) {
                if (typeof value !== 'object' || Array.isArray(value)) {
                    throw new Error('[Zenith:Config] Key "experimental" must be a plain object');
                }
                result[key] = { ...DEFAULTS.experimental };
                continue;
            }
            result[key] = value as never;
        }
    }

    return result;
}

export async function loadConfig(projectRoot: string): Promise<ZenithConfig> {
    const configPath = join(projectRoot, 'zenith.config.js');

    try {
        const url = pathToFileURL(configPath).href;
        const mod = await import(url);
        const raw = mod.default || mod;
        return validateConfig(raw);
    } catch (err) {
        const error = err as NodeJS.ErrnoException & { message?: string };
        if (
            error.code === 'ERR_MODULE_NOT_FOUND' ||
            error.code === 'ENOENT' ||
            error.message?.includes('Cannot find module') ||
            error.message?.includes('ENOENT')
        ) {
            return { ...DEFAULTS };
        }
        throw err;
    }
}

export function getDefaults(): ZenithConfig {
    return { ...DEFAULTS };
}
