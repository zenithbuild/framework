import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { KNOWN_TARGETS } from './adapters/adapter-types.js';
import { normalizeBasePath } from './base-path.js';
import { normalizeImageConfig } from './images/shared.js';

const PACKAGE_REQUIRE = createRequire(import.meta.url);
const CONFIG_FILES = ['zenith.config.ts', 'zenith.config.js'];
const CONFIG_META = Symbol('zenith.config.meta');

export const DEFAULT_CONFIG = {
    router: false,
    embeddedMarkupExpressions: false,
    typescriptDefault: true,
    outDir: 'dist',
    pagesDir: 'pages',
    basePath: '/',
    target: 'static',
    adapter: null,
    strictDomLints: false,
    images: normalizeImageConfig()
};

const TOP_LEVEL_SCHEMA = {
    router: 'boolean',
    embeddedMarkupExpressions: 'boolean',
    typescriptDefault: 'boolean',
    outDir: 'string',
    pagesDir: 'string',
    basePath: 'string',
    target: 'string',
    adapter: 'object',
    strictDomLints: 'boolean',
    images: 'object'
};

function attachConfigMeta(config, explicitKeys) {
    Object.defineProperty(config, CONFIG_META, {
        value: { explicitKeys: new Set(explicitKeys), loaded: false },
        enumerable: false,
        configurable: true,
        writable: true
    });
    return config;
}

function markLoaded(config) {
    if (config?.[CONFIG_META]) {
        config[CONFIG_META].loaded = true;
    }
    return config;
}

function validateAdapterValue(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('[Zenith:Config] Key "adapter" must be a plain object');
    }
    if (typeof value.name !== 'string' || value.name.trim().length === 0) {
        throw new Error('[Zenith:Config] Key "adapter.name" must be a non-empty string');
    }
    if (typeof value.validateRoutes !== 'function') {
        throw new Error('[Zenith:Config] Key "adapter.validateRoutes" must be a function');
    }
    if (typeof value.adapt !== 'function') {
        throw new Error('[Zenith:Config] Key "adapter.adapt" must be a function');
    }
    return value;
}

function resolveConfigFile(projectRoot) {
    const matches = CONFIG_FILES
        .map((name) => join(projectRoot, name))
        .filter((candidate) => existsSync(candidate));
    if (matches.length > 1) {
        throw new Error(
            `[Zenith:Config] Multiple config files found. Keep exactly one of: ${CONFIG_FILES.join(', ')}`
        );
    }
    return matches[0] || null;
}

function resolveTypeScriptApi(projectRoot) {
    try {
        const projectRequire = createRequire(join(projectRoot, '__zenith_config_loader__.js'));
        return projectRequire('typescript');
    } catch {
        try {
            return PACKAGE_REQUIRE('typescript');
        } catch {
            throw new Error(
                '[Zenith:Config] zenith.config.ts requires the `typescript` package to be installed.'
            );
        }
    }
}

async function importTypescriptConfig(configPath, projectRoot) {
    const source = await readFile(configPath, 'utf8');
    const ts = resolveTypeScriptApi(projectRoot);
    const transpiled = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
            moduleResolution: ts.ModuleResolutionKind.NodeNext,
            esModuleInterop: true,
            allowSyntheticDefaultImports: true
        },
        fileName: configPath
    }).outputText;
    const tempConfigPath = join(
        projectRoot,
        `.zenith.config.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.mjs`
    );

    await writeFile(tempConfigPath, transpiled, 'utf8');
    try {
        return await import(`${pathToFileURL(tempConfigPath).href}?t=${Date.now()}`);
    } finally {
        await rm(tempConfigPath, { force: true });
    }
}

async function importJavascriptConfig(configPath, projectRoot) {
    const source = await readFile(configPath, 'utf8');
    const isCommonJs = /\bmodule\.exports\b|\bexports\./.test(source);
    const tempConfigPath = join(
        projectRoot,
        `.zenith.config.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.${isCommonJs ? 'cjs' : 'mjs'}`
    );
    await writeFile(tempConfigPath, source, 'utf8');
    try {
        if (isCommonJs) {
            const projectRequire = createRequire(join(projectRoot, '__zenith_config_loader__.js'));
            const resolvedPath = projectRequire.resolve(tempConfigPath);
            const requireCache = projectRequire.cache || PACKAGE_REQUIRE.cache;
            if (requireCache && resolvedPath in requireCache) {
                delete requireCache[resolvedPath];
            }
            return projectRequire(tempConfigPath);
        }
        return await import(`${pathToFileURL(tempConfigPath).href}?t=${Date.now()}`);
    } finally {
        await rm(tempConfigPath, { force: true });
    }
}

export function hasExplicitConfigKey(config, key) {
    return Boolean(config?.[CONFIG_META]?.explicitKeys?.has(key));
}

export function isLoadedConfig(config) {
    return Boolean(config?.[CONFIG_META]?.loaded === true);
}

export function isConfigKeyExplicit(config, key) {
    if (config && typeof config === 'object' && config[CONFIG_META]) {
        return hasExplicitConfigKey(config, key);
    }
    return Boolean(config && Object.prototype.hasOwnProperty.call(config, key));
}

export function resolveConfigPagesDir(projectRoot, config) {
    if (isConfigKeyExplicit(config, 'pagesDir')) {
        return resolve(projectRoot, config.pagesDir);
    }

    const rootPagesDir = join(projectRoot, 'pages');
    if (existsSync(rootPagesDir)) {
        return rootPagesDir;
    }

    const srcPagesDir = join(projectRoot, 'src', 'pages');
    if (existsSync(srcPagesDir)) {
        return srcPagesDir;
    }

    return resolve(projectRoot, config?.pagesDir || DEFAULT_CONFIG.pagesDir);
}

export function resolveConfigOutDir(projectRoot, config) {
    return resolve(projectRoot, config?.outDir || DEFAULT_CONFIG.outDir);
}

export function validateConfig(config) {
    if (config === null || config === undefined) {
        return attachConfigMeta(
            { ...DEFAULT_CONFIG, images: normalizeImageConfig() },
            []
        );
    }
    if (typeof config !== 'object' || Array.isArray(config)) {
        throw new Error('[Zenith:Config] Config must be a plain object');
    }

    for (const key of Object.keys(config)) {
        if (!(key in TOP_LEVEL_SCHEMA)) {
            throw new Error(`[Zenith:Config] Unknown key: "${key}"`);
        }
    }
    if ('target' in config && 'adapter' in config) {
        throw new Error('[Zenith:Config] Keys "target" and "adapter" are mutually exclusive');
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
        if (key === 'adapter') {
            result.adapter = validateAdapterValue(value);
            continue;
        }
        if (typeof value !== expectedType) {
            throw new Error(`[Zenith:Config] Key "${key}" must be ${expectedType}, got ${typeof value}`);
        }
        if (expectedType === 'string' && value.trim().length === 0) {
            throw new Error(`[Zenith:Config] Key "${key}" must be a non-empty string`);
        }
        if (key === 'target' && !KNOWN_TARGETS.includes(value)) {
            throw new Error(`[Zenith:Config] Unsupported target: "${value}"`);
        }
        if (key === 'basePath') {
            result.basePath = normalizeBasePath(value);
            continue;
        }
        result[key] = value;
    }

    return attachConfigMeta(result, Object.keys(config));
}

export async function loadConfig(projectRoot) {
    const resolvedProjectRoot = resolve(projectRoot);
    const configPath = resolveConfigFile(resolvedProjectRoot);
    if (!configPath) {
        return markLoaded(validateConfig(null));
    }

    const mod = configPath.endsWith('.ts')
        ? await importTypescriptConfig(configPath, resolvedProjectRoot)
        : await importJavascriptConfig(configPath, resolvedProjectRoot);
    return markLoaded(validateConfig(mod.default || mod));
}
