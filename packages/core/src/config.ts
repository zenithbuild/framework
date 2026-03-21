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
    images: ZenithImageConfig;
}

export interface ZenithImageRemotePattern {
    protocol: string;
    hostname: string;
    port?: string;
    pathname?: string;
    search?: string;
}

export interface ZenithImageConfig {
    formats: string[];
    quality: number;
    deviceSizes: number[];
    imageSizes: number[];
    remotePatterns: ZenithImageRemotePattern[];
    allowSvg: boolean;
    maxRemoteBytes: number;
    maxPixels: number;
    minimumCacheTTL: number;
    dangerouslyAllowLocalNetwork: boolean;
}

type ConfigInput = Partial<ZenithConfig> | null | undefined;

const DEFAULT_IMAGE_CONFIG: ZenithImageConfig = {
    formats: ['webp', 'avif'],
    quality: 75,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    remotePatterns: [],
    allowSvg: false,
    maxRemoteBytes: 10 * 1024 * 1024,
    maxPixels: 40_000_000,
    minimumCacheTTL: 60,
    dangerouslyAllowLocalNetwork: false
};

const DEFAULTS: ZenithConfig = {
    router: false,
    embeddedMarkupExpressions: false,
    types: true,
    typescriptDefault: true,
    outDir: 'dist',
    pagesDir: 'pages',
    experimental: {},
    strictDomLints: false,
    images: DEFAULT_IMAGE_CONFIG
};

const SCHEMA: Record<keyof ZenithConfig, string> = {
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

function cloneImageConfig(): ZenithImageConfig {
    return {
        formats: [...DEFAULT_IMAGE_CONFIG.formats],
        quality: DEFAULT_IMAGE_CONFIG.quality,
        deviceSizes: [...DEFAULT_IMAGE_CONFIG.deviceSizes],
        imageSizes: [...DEFAULT_IMAGE_CONFIG.imageSizes],
        remotePatterns: [],
        allowSvg: DEFAULT_IMAGE_CONFIG.allowSvg,
        maxRemoteBytes: DEFAULT_IMAGE_CONFIG.maxRemoteBytes,
        maxPixels: DEFAULT_IMAGE_CONFIG.maxPixels,
        minimumCacheTTL: DEFAULT_IMAGE_CONFIG.minimumCacheTTL,
        dangerouslyAllowLocalNetwork: DEFAULT_IMAGE_CONFIG.dangerouslyAllowLocalNetwork
    };
}

function requirePositiveInt(value: unknown, key: string): number {
    if (!Number.isInteger(value) || Number(value) <= 0) {
        throw new Error(`[Zenith:Config] images.${key} must be a positive integer`);
    }
    return Number(value);
}

function normalizeStringList(value: unknown, key: string): string[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error(`[Zenith:Config] images.${key} must be a non-empty array`);
    }
    const out = value.map((entry) => {
        if (typeof entry !== 'string' || entry.trim() === '') {
            throw new Error(`[Zenith:Config] images.${key} must contain non-empty strings`);
        }
        return entry.trim().toLowerCase();
    });
    return [...new Set(out)];
}

function normalizePositiveIntList(value: unknown, key: string): number[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error(`[Zenith:Config] images.${key} must be a non-empty array`);
    }
    const out = value.map((entry) => requirePositiveInt(entry, key));
    return [...new Set(out)].sort((left, right) => left - right);
}

function normalizeRemotePatterns(value: unknown): ZenithImageRemotePattern[] {
    if (!Array.isArray(value)) {
        throw new Error('[Zenith:Config] images.remotePatterns must be an array');
    }
    return value.map((entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            throw new Error('[Zenith:Config] images.remotePatterns must contain plain objects');
        }
        const protocol = typeof entry.protocol === 'string' && entry.protocol.trim().length > 0
            ? entry.protocol.trim().replace(/:$/, '').toLowerCase()
            : 'https';
        const hostname = typeof entry.hostname === 'string' ? entry.hostname.trim().toLowerCase() : '';
        if (!hostname) {
            throw new Error('[Zenith:Config] images.remotePatterns[].hostname is required');
        }
        return {
            protocol,
            hostname,
            port: typeof entry.port === 'string' ? entry.port.trim() : '',
            pathname: typeof entry.pathname === 'string' && entry.pathname.trim().length > 0
                ? entry.pathname.trim()
                : '/**',
            search: typeof entry.search === 'string' ? entry.search : ''
        };
    });
}

function normalizeImageConfig(input: unknown): ZenithImageConfig {
    if (input === undefined || input === null) {
        return cloneImageConfig();
    }
    if (typeof input !== 'object' || Array.isArray(input)) {
        throw new Error('[Zenith:Config] images must be a plain object');
    }

    const allowed = new Set([
        'formats',
        'quality',
        'deviceSizes',
        'imageSizes',
        'remotePatterns',
        'allowSvg',
        'maxRemoteBytes',
        'maxPixels',
        'minimumCacheTTL',
        'dangerouslyAllowLocalNetwork'
    ]);
    for (const key of Object.keys(input)) {
        if (!allowed.has(key)) {
            throw new Error(`[Zenith:Config] Unknown key: "images.${key}"`);
        }
    }

    const config = cloneImageConfig();
    if ('formats' in input) {
        config.formats = normalizeStringList((input as Record<string, unknown>).formats, 'formats');
    }
    if ('quality' in input) {
        config.quality = requirePositiveInt((input as Record<string, unknown>).quality, 'quality');
    }
    if ('deviceSizes' in input) {
        config.deviceSizes = normalizePositiveIntList((input as Record<string, unknown>).deviceSizes, 'deviceSizes');
    }
    if ('imageSizes' in input) {
        config.imageSizes = normalizePositiveIntList((input as Record<string, unknown>).imageSizes, 'imageSizes');
    }
    if ('remotePatterns' in input) {
        config.remotePatterns = normalizeRemotePatterns((input as Record<string, unknown>).remotePatterns);
    }
    if ('allowSvg' in input) {
        if (typeof (input as Record<string, unknown>).allowSvg !== 'boolean') {
            throw new Error('[Zenith:Config] images.allowSvg must be boolean');
        }
        config.allowSvg = Boolean((input as Record<string, unknown>).allowSvg);
    }
    if ('maxRemoteBytes' in input) {
        config.maxRemoteBytes = requirePositiveInt((input as Record<string, unknown>).maxRemoteBytes, 'maxRemoteBytes');
    }
    if ('maxPixels' in input) {
        config.maxPixels = requirePositiveInt((input as Record<string, unknown>).maxPixels, 'maxPixels');
    }
    if ('minimumCacheTTL' in input) {
        config.minimumCacheTTL = requirePositiveInt((input as Record<string, unknown>).minimumCacheTTL, 'minimumCacheTTL');
    }
    if ('dangerouslyAllowLocalNetwork' in input) {
        if (typeof (input as Record<string, unknown>).dangerouslyAllowLocalNetwork !== 'boolean') {
            throw new Error('[Zenith:Config] images.dangerouslyAllowLocalNetwork must be boolean');
        }
        config.dangerouslyAllowLocalNetwork = Boolean((input as Record<string, unknown>).dangerouslyAllowLocalNetwork);
    }
    return config;
}

export function validateConfig(config: ConfigInput): ZenithConfig {
    if (config === null || config === undefined) {
        return { ...DEFAULTS, images: cloneImageConfig() };
    }

    if (typeof config !== 'object' || Array.isArray(config)) {
        throw new Error('[Zenith:Config] Config must be a plain object');
    }

    for (const key of Object.keys(config)) {
        if (!(key in SCHEMA)) {
            throw new Error(`[Zenith:Config] Unknown key: "${key}"`);
        }
    }

    const result: ZenithConfig = { ...DEFAULTS, images: cloneImageConfig() };

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
            if (key === 'images') {
                result.images = normalizeImageConfig(value);
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
            return { ...DEFAULTS, images: cloneImageConfig() };
        }
        throw err;
    }
}

export function getDefaults(): ZenithConfig {
    return { ...DEFAULTS, images: cloneImageConfig() };
}
