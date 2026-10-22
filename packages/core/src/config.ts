export { defineConfig, validateConfig, getDefaults } from '@zenithbuild/config';
export type {
  BuildManifest, BuildManifestRoute, RouteManifestEntry, ZenithAdapter,
  ZenithPathKind, ZenithRenderMode, ZenithTarget, ZenithConfig, ZenithConfigInput,
  ZenithImageConfig, ZenithImageRemotePattern, ZenithPlugin,
  ZenithPluginConfigContext, ZenithPluginConfigPatch
} from '@zenithbuild/config';
export { loadConfig } from '@zenithbuild/config/node';
