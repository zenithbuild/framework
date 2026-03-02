/**
 * Zenith Config
 * 
 * Public exports for zenith/config
 * 
 * Core exports ONLY generic plugin infrastructure.
 * Plugin-specific types are owned by their respective plugins.
 */

export { defineConfig } from './types';
export type {
    ZenithConfig,
    ZenithPlugin,
    PluginContext,
    PluginData
} from './types';
export { loadZenithConfig, hasZenithConfig } from './loader';

