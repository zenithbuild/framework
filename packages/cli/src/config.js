import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getDefaults, validateConfig as validateSharedConfig } from '@zenithbuild/core/config';
import { loadConfigWithKeys } from '@zenithbuild/core/config/node';

const CONFIG_META = Symbol('zenith.config.meta');
export const DEFAULT_CONFIG = getDefaults();

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
    return attachConfigMeta(validateSharedConfig(config), Object.keys(config || {}));
}

export async function loadConfig(projectRoot) {
    const { config, explicitKeys } = await loadConfigWithKeys(projectRoot);
    return markLoaded(attachConfigMeta(config, explicitKeys));
}
