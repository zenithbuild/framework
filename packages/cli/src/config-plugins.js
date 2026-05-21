const PLUGIN_OBJECT_KEYS = new Set(['name', 'config']);
const freezeObject = Object.freeze;

export const PLUGIN_CONFIG_PATCH_KEYS = new Set([
    'router',
    'embeddedMarkupExpressions',
    'typescriptDefault',
    'strictDomLints',
    'images',
    'basePath',
    'outDir'
]);

function isPlainObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function describePlugin(index, plugin) {
    if (plugin && typeof plugin === 'object' && typeof plugin.name === 'string' && plugin.name.trim()) {
        return `"${plugin.name.trim()}"`;
    }
    return `at index ${index}`;
}

export function normalizePlugins(value) {
    if (!Array.isArray(value)) {
        throw new Error('[Zenith:Config] Key "plugins" must be an array');
    }

    const seen = new Set();
    return value.map((plugin, index) => {
        if (!isPlainObject(plugin)) {
            throw new Error(`[Zenith:Config] Plugin at index ${index} must be a plain object`);
        }
        for (const key of Object.keys(plugin)) {
            if (!PLUGIN_OBJECT_KEYS.has(key)) {
                throw new Error(
                    `[Zenith:Config] Plugin ${describePlugin(index, plugin)} uses unsupported key "${key}"`
                );
            }
        }
        if (typeof plugin.name !== 'string' || plugin.name.trim().length === 0) {
            throw new Error(`[Zenith:Config] Plugin at index ${index} must have a non-empty name`);
        }
        const name = plugin.name.trim();
        if (seen.has(name)) {
            throw new Error(`[Zenith:Config] Duplicate plugin name: "${name}"`);
        }
        seen.add(name);
        if ('config' in plugin && typeof plugin.config !== 'function') {
            throw new Error(`[Zenith:Config] Plugin "${name}" key "config" must be a function`);
        }
        return 'config' in plugin ? { name, config: plugin.config } : { name };
    });
}

export function assertPluginConfigPatch(value) {
    if (!isPlainObject(value)) {
        throw new Error('config hook must return a plain object patch');
    }
    for (const key of Object.keys(value)) {
        if (!PLUGIN_CONFIG_PATCH_KEYS.has(key)) {
            throw new Error(`${key} is not patchable`);
        }
    }
}

export function cloneConfigValue(value, seen = new Map()) {
    if (!value || typeof value !== 'object') {
        return value;
    }
    if (seen.has(value)) {
        return seen.get(value);
    }
    if (Array.isArray(value)) {
        const out = [];
        seen.set(value, out);
        for (const item of value) {
            out.push(cloneConfigValue(item, seen));
        }
        return out;
    }
    const out = {};
    seen.set(value, out);
    for (const [key, child] of Object.entries(value)) {
        out[key] = cloneConfigValue(child, seen);
    }
    return out;
}

export function deepFreeze(value, seen = new Set()) {
    if (!value || (typeof value !== 'object' && typeof value !== 'function') || seen.has(value)) {
        return value;
    }
    seen.add(value);
    for (const key of Object.keys(value)) {
        deepFreeze(value[key], seen);
    }
    return freezeObject(value);
}

export function pluginHookError(pluginName, hookName, error) {
    const message = error && typeof error.message === 'string'
        ? error.message
        : String(error);
    return new Error(`[Zenith plugin ${pluginName}] ${hookName} failed: ${message}`);
}
