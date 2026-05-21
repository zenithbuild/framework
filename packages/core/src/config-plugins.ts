import type { ZenithConfig } from './config.js';

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
] as const);

export type ZenithPluginConfigPatch = Partial<Pick<
  ZenithConfig,
  | 'router'
  | 'embeddedMarkupExpressions'
  | 'typescriptDefault'
  | 'strictDomLints'
  | 'images'
  | 'basePath'
  | 'outDir'
>>;

export interface ZenithPluginConfigContext {
  projectRoot: string;
}

export interface ZenithPlugin {
  name: string;
  config?(
    config: Readonly<ZenithConfig>,
    ctx: ZenithPluginConfigContext
  ): ZenithPluginConfigPatch | void | Promise<ZenithPluginConfigPatch | void>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function describePlugin(index: number, plugin: unknown): string {
  if (plugin && typeof plugin === 'object') {
    const name = (plugin as Record<string, unknown>).name;
    if (typeof name === 'string' && name.trim()) {
      return `"${name.trim()}"`;
    }
  }
  return `at index ${index}`;
}

export function normalizePlugins(value: unknown): ZenithPlugin[] {
  if (!Array.isArray(value)) {
    throw new Error('[Zenith:Config] Key "plugins" must be an array');
  }

  const seen = new Set<string>();
  return value.map((plugin, index) => {
    if (!isPlainObject(plugin)) {
      throw new Error(`[Zenith:Config] Plugin at index ${index} must be a plain object`);
    }
    for (const key of Object.keys(plugin)) {
      if (!PLUGIN_OBJECT_KEYS.has(key)) {
        throw new Error(`[Zenith:Config] Plugin ${describePlugin(index, plugin)} uses unsupported key "${key}"`);
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
    if ('config' in plugin) {
      return { name, config: plugin.config as NonNullable<ZenithPlugin['config']> };
    }
    return { name };
  });
}

export function assertPluginConfigPatch(value: unknown): asserts value is Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new Error('config hook must return a plain object patch');
  }
  for (const key of Object.keys(value)) {
    if (!PLUGIN_CONFIG_PATCH_KEYS.has(key as never)) {
      throw new Error(`${key} is not patchable`);
    }
  }
}

export function cloneConfigValue<T>(value: T, seen = new Map<object, unknown>()): T {
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    return seen.get(value) as T;
  }
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    seen.set(value, out);
    for (const item of value) {
      out.push(cloneConfigValue(item, seen));
    }
    return out as T;
  }
  const out: Record<string, unknown> = {};
  seen.set(value, out);
  for (const [key, child] of Object.entries(value)) {
    out[key] = cloneConfigValue(child, seen);
  }
  return out as T;
}

export function deepFreeze<T>(value: T, seen = new Set<object>()): Readonly<T> {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
    return value as Readonly<T>;
  }
  const objectValue = value as object;
  if (seen.has(objectValue)) {
    return value as Readonly<T>;
  }
  seen.add(objectValue);
  for (const key of Object.keys(value)) {
    deepFreeze((value as Record<string, unknown>)[key], seen);
  }
  return freezeObject(value);
}

export function pluginHookError(pluginName: string, hookName: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`[Zenith plugin ${pluginName}] ${hookName} failed: ${message}`);
}
