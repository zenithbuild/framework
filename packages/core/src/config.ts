import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ZENITH_TARGETS } from './config-targets.js';
import type { ZenithAdapter, ZenithTarget } from './config-types.js';
import {
  assertPluginConfigPatch,
  cloneConfigValue,
  deepFreeze,
  normalizePlugins,
  pluginHookError,
  type ZenithPlugin
} from './config-plugins.js';
export type {
  BuildManifest,
  BuildManifestRoute,
  RouteManifestEntry,
  ZenithAdapter,
  ZenithPathKind,
  ZenithRenderMode,
  ZenithTarget
} from './config-types.js';
export type {
  ZenithPlugin,
  ZenithPluginConfigContext,
  ZenithPluginConfigPatch
} from './config-plugins.js';

const PACKAGE_REQUIRE = createRequire(import.meta.url);
const CONFIG_FILES = ['zenith.config.ts', 'zenith.config.js'] as const;

export interface ZenithConfig {
  router: boolean;
  embeddedMarkupExpressions: boolean;
  typescriptDefault: boolean;
  outDir: string;
  pagesDir: string;
  basePath: string;
  target: ZenithTarget;
  adapter: ZenithAdapter | null;
  strictDomLints: boolean;
  images: ZenithImageConfig;
  plugins: ZenithPlugin[];
}

export type ZenithConfigInput =
  & Partial<Omit<ZenithConfig, 'target' | 'adapter'>>
  & (
    | { target?: ZenithTarget; adapter?: never }
    | { target?: never; adapter: ZenithAdapter }
  );

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

type ConfigInput = ZenithConfigInput | null | undefined;

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
  typescriptDefault: true,
  outDir: 'dist',
  pagesDir: 'pages',
  basePath: '/',
  target: 'static',
  adapter: null,
  strictDomLints: false,
  images: DEFAULT_IMAGE_CONFIG,
  plugins: []
};

const SCHEMA: Record<Exclude<keyof ZenithConfig, 'images' | 'adapter' | 'plugins'>, string>
  & { images: 'object'; adapter: 'object'; plugins: 'array' } = {
  router: 'boolean',
  embeddedMarkupExpressions: 'boolean',
  typescriptDefault: 'boolean',
  outDir: 'string',
  pagesDir: 'string',
  basePath: 'string',
  target: 'string',
  adapter: 'object',
  strictDomLints: 'boolean',
  images: 'object',
  plugins: 'array'
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

function normalizeBasePath(value: unknown): string {
  const raw = String(value ?? '/').trim();
  if (!raw || raw === '/') {
    return '/';
  }
  if (raw.includes('?') || raw.includes('#')) {
    throw new Error('[Zenith:Config] Key "basePath" must not include query or hash fragments');
  }
  if (!raw.startsWith('/')) {
    throw new Error('[Zenith:Config] Key "basePath" must start with "/"');
  }
  const normalized = raw.replace(/\/{2,}/g, '/').replace(/\/+$/g, '');
  return normalized || '/';
}

function validateAdapterValue(value: unknown): ZenithAdapter {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('[Zenith:Config] Key "adapter" must be a plain object');
  }
  if (typeof (value as ZenithAdapter).name !== 'string' || (value as ZenithAdapter).name.trim().length === 0) {
    throw new Error('[Zenith:Config] Key "adapter.name" must be a non-empty string');
  }
  if (typeof (value as ZenithAdapter).validateRoutes !== 'function') {
    throw new Error('[Zenith:Config] Key "adapter.validateRoutes" must be a function');
  }
  if (typeof (value as ZenithAdapter).adapt !== 'function') {
    throw new Error('[Zenith:Config] Key "adapter.adapt" must be a function');
  }
  return value as ZenithAdapter;
}

function resolveConfigFile(projectRoot: string): string | null {
  const matches = CONFIG_FILES
    .map((name) => join(projectRoot, name))
    .filter((candidate) => existsSync(candidate));
  if (matches.length > 1) {
    throw new Error(`[Zenith:Config] Multiple config files found. Keep exactly one of: ${CONFIG_FILES.join(', ')}`);
  }
  return matches[0] || null;
}

function resolveTypeScriptApi(projectRoot: string) {
  try {
    const projectRequire = createRequire(join(projectRoot, '__zenith_config_loader__.js'));
    return projectRequire('typescript');
  } catch {
    try {
      return PACKAGE_REQUIRE('typescript');
    } catch {
      throw new Error('[Zenith:Config] zenith.config.ts requires the `typescript` package to be installed.');
    }
  }
}

function importTypescriptConfig(configPath: string, projectRoot: string) {
  return readFile(configPath, 'utf8').then((source) => {
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
    return writeFile(tempConfigPath, transpiled, 'utf8')
      .then(() => import(`${pathToFileURL(tempConfigPath).href}?t=${Date.now()}`))
      .finally(() => rm(tempConfigPath, { force: true }));
  });
}

function importJavascriptConfig(configPath: string, projectRoot: string) {
  return readFile(configPath, 'utf8').then((source) => {
    const isCommonJs = /\bmodule\.exports\b|\bexports\./.test(source);
    const tempConfigPath = join(
      projectRoot,
      `.zenith.config.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.${isCommonJs ? 'cjs' : 'mjs'}`
    );
    return writeFile(tempConfigPath, source, 'utf8')
      .then(() => {
        if (isCommonJs) {
          const projectRequire = createRequire(join(projectRoot, '__zenith_config_loader__.js'));
          const resolvedPath = projectRequire.resolve(tempConfigPath);
          const requireCache = projectRequire.cache || PACKAGE_REQUIRE.cache;
          if (requireCache && resolvedPath in requireCache) {
            delete requireCache[resolvedPath];
          }
          return projectRequire(tempConfigPath);
        }
        return import(`${pathToFileURL(tempConfigPath).href}?t=${Date.now()}`);
      })
      .finally(() => rm(tempConfigPath, { force: true }));
  });
}

export function defineConfig<T extends ZenithConfigInput>(config: T): T {
  return config;
}

export function validateConfig(config: ConfigInput): ZenithConfig {
  if (config === null || config === undefined) {
    return { ...DEFAULTS, images: cloneImageConfig(), plugins: [] };
  }

  if (typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('[Zenith:Config] Config must be a plain object');
  }

  for (const key of Object.keys(config)) {
    if (!(key in SCHEMA)) {
      throw new Error(`[Zenith:Config] Unknown key: "${key}"`);
    }
  }
  if ('target' in config && 'adapter' in config) {
    throw new Error('[Zenith:Config] Keys "target" and "adapter" are mutually exclusive');
  }

  const result: ZenithConfig = { ...DEFAULTS, images: cloneImageConfig(), plugins: [] };

  for (const [key, expectedType] of Object.entries(SCHEMA) as Array<[keyof ZenithConfig, string]>) {
    if (!(key in config)) {
      continue;
    }
    const value = config[key as keyof ZenithConfigInput];
    if (key === 'images') {
      result.images = normalizeImageConfig(value);
      continue;
    }
    if (key === 'adapter') {
      result.adapter = validateAdapterValue(value);
      continue;
    }
    if (key === 'plugins') {
      result.plugins = normalizePlugins(value);
      continue;
    }
    if (typeof value !== expectedType) {
      throw new Error(`[Zenith:Config] Key "${key}" must be ${expectedType}, got ${typeof value}`);
    }
    if (expectedType === 'string' && typeof value === 'string' && value.trim() === '') {
      throw new Error(`[Zenith:Config] Key "${key}" must be a non-empty string`);
    }
    if (key === 'target' && !ZENITH_TARGETS.includes(value as ZenithTarget)) {
      throw new Error(`[Zenith:Config] Unsupported target: "${value as string}"`);
    }
    if (key === 'basePath') {
      result.basePath = normalizeBasePath(value);
      continue;
    }
    result[key] = value as never;
  }

  return result;
}

function normalizeConfigPatch(patch: unknown): Partial<ZenithConfig> {
  assertPluginConfigPatch(patch);
  const keys = Object.keys(patch);
  const normalized = validateConfig(patch as ConfigInput);
  const out: Partial<ZenithConfig> = {};
  for (const key of keys as Array<keyof ZenithConfig>) {
    out[key] = cloneConfigValue(normalized[key]) as never;
  }
  return out;
}

function runPluginConfigHooks(config: ZenithConfig, projectRoot: string): Promise<ZenithConfig> {
  return config.plugins.reduce<Promise<ZenithConfig>>((promise, plugin) => promise.then((current) => {
    if (typeof plugin.config !== 'function') {
      return current;
    }

    const snapshot = deepFreeze(cloneConfigValue(current));
    return Promise.resolve()
      .then(() => plugin.config?.(snapshot, { projectRoot }))
      .catch((error) => {
        throw pluginHookError(plugin.name, 'config', error);
      })
      .then((patch) => {
        if (patch === undefined || patch === null) {
          return current;
        }

        let normalizedPatch: Partial<ZenithConfig>;
        try {
          normalizedPatch = normalizeConfigPatch(patch);
        } catch (error) {
          throw pluginHookError(plugin.name, 'config', error);
        }
        return { ...current, ...normalizedPatch, plugins: current.plugins };
      });
  }), Promise.resolve(config));
}

export async function loadConfig(projectRoot: string): Promise<ZenithConfig> {
  const resolvedProjectRoot = resolve(projectRoot);
  const configPath = resolveConfigFile(resolvedProjectRoot);
  if (!configPath) {
    return { ...DEFAULTS, images: cloneImageConfig() };
  }

  const mod = configPath.endsWith('.ts')
    ? await importTypescriptConfig(configPath, resolvedProjectRoot)
    : await importJavascriptConfig(configPath, resolvedProjectRoot);
  return runPluginConfigHooks(validateConfig(mod.default || mod), resolvedProjectRoot);
}

export function getDefaults(): ZenithConfig {
  return { ...DEFAULTS, images: cloneImageConfig(), plugins: [] };
}
