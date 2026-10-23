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

import { normalizeBasePath } from './base-path.js';
import { normalizeImageConfig } from './image-config.js';

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
  images: normalizeImageConfig(),
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

export function defineConfig<T extends ZenithConfigInput>(config: T): T {
  return config;
}

export function validateConfig(config: ConfigInput): ZenithConfig {
  if (config === null || config === undefined) {
    return { ...DEFAULTS, images: normalizeImageConfig(), plugins: [] };
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

  const result: ZenithConfig = { ...DEFAULTS, images: normalizeImageConfig(), plugins: [] };

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

export function getDefaults(): ZenithConfig {
  return validateConfig(null);
}
