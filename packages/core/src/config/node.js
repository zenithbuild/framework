import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateConfig } from './config.js';
import { assertPluginConfigPatch, cloneConfigValue, deepFreeze, pluginHookError } from './config-plugins.js';

const PACKAGE_REQUIRE = createRequire(import.meta.url);
const CONFIG_FILES = ['zenith.config.ts', 'zenith.config.js'];

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

function normalizeConfigPatch(patch) {
    assertPluginConfigPatch(patch);
    const keys = Object.keys(patch);
    const normalized = validateConfig(patch);
    const out = {};
    for (const key of keys) {
        out[key] = cloneConfigValue(normalized[key]);
    }
    return out;
}

async function runPluginConfigHooks(config, projectRoot, explicitKeys) {
    let current = config;
    for (const plugin of current.plugins) {
        if (typeof plugin.config !== 'function') {
            continue;
        }

        let patch;
        try {
            const snapshot = deepFreeze(cloneConfigValue(current));
            patch = await plugin.config(snapshot, { projectRoot });
        } catch (error) {
            throw pluginHookError(plugin.name, 'config', error);
        }

        if (patch === undefined || patch === null) {
            continue;
        }

        let normalizedPatch;
        try {
            normalizedPatch = normalizeConfigPatch(patch);
        } catch (error) {
            throw pluginHookError(plugin.name, 'config', error);
        }

        for (const key of Object.keys(normalizedPatch)) {
            explicitKeys.add(key);
        }
        current = { ...current, ...normalizedPatch, plugins: current.plugins };
    }
    return current;
}

export async function loadConfigWithKeys(projectRoot) {
    const resolvedProjectRoot = resolve(projectRoot);
    const configPath = resolveConfigFile(resolvedProjectRoot);
    if (!configPath) {
        return { config: validateConfig(null), explicitKeys: new Set() };
    }
    const mod = configPath.endsWith('.ts')
        ? await importTypescriptConfig(configPath, resolvedProjectRoot)
        : await importJavascriptConfig(configPath, resolvedProjectRoot);
    const input = mod.default || mod;
    const config = validateConfig(input);
    const explicitKeys = new Set(Object.keys(input));
    return {
        config: await runPluginConfigHooks(config, resolvedProjectRoot, explicitKeys),
        explicitKeys
    };
}

export async function loadConfig(projectRoot) {
    return (await loadConfigWithKeys(projectRoot)).config;
}
