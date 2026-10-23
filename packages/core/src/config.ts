export { defineConfig, validateConfig, getDefaults } from './config/config.js';
export { ZENITH_TARGETS } from './config/config-targets.js';
export type {
  BuildManifest, BuildManifestRoute, RouteManifestEntry, ZenithAdapter,
  ZenithPathKind, ZenithRenderMode, ZenithTarget, ZenithConfig, ZenithConfigInput,
  ZenithImageConfig, ZenithImageRemotePattern, ZenithPlugin,
  ZenithPluginConfigContext, ZenithPluginConfigPatch
} from './config/config.js';
export { loadConfig } from './config/node.js';
