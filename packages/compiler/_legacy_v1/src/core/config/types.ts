/**
 * Zenith Config Types
 * 
 * Configuration interfaces for zenith.config.ts
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 * HOOK OWNERSHIP RULE (CANONICAL)
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Core may ONLY define types that are universally valid in all Zenith applications.
 * Plugin-specific types MUST be owned by their respective plugins.
 * 
 * ✅ ALLOWED in Core:
 *    - ZenithConfig, ZenithPlugin, PluginContext (generic plugin infrastructure)
 *    - Universal lifecycle hooks (onMount, onUnmount)
 *    - Reactivity primitives (signal, effect, etc.)
 * 
 * ❌ PROHIBITED in Core:
 *    - Content plugin types (ContentItem, ContentSourceConfig, etc.)
 *    - Router plugin types (RouteState, NavigationGuard, etc.)
 *    - Documentation plugin types
 *    - Any type that exists only because a plugin exists
 * 
 * If removing a plugin would make a type meaningless, that type belongs to the plugin.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { CLIBridgeAPI } from '../plugins/bridge';

// ============================================
// Core Plugin Types (Generic Infrastructure)
// ============================================

/**
 * Generic data record for plugin data exchange
 * Plugins define their own specific types internally
 */
export type PluginData = Record<string, unknown[]>;

/**
 * Context passed to plugins during setup
 * 
 * This is intentionally generic - plugins define their own data shapes.
 * Core provides the stage, plugins bring the actors.
 */
export interface PluginContext {
    /** Absolute path to project root */
    projectRoot: string;

    /** 
     * Set plugin data for the runtime
     * 
     * Generic setter - plugins define their own data structures.
     * The runtime stores this data and makes it available to components.
     * 
     * @example
     * // Content plugin uses it for content items
     * ctx.setPluginData('content', contentItems);
     * 
     * // Analytics plugin uses it for tracking config
     * ctx.setPluginData('analytics', analyticsConfig);
     */
    setPluginData: (namespace: string, data: unknown[]) => void;

    /** Additional options passed from config */
    options?: Record<string, unknown>;
}

/**
 * A Zenith plugin definition
 * 
 * Plugins are self-contained, removable extensions.
 * Core must build and run identically with or without any plugin installed.
 */
export interface ZenithPlugin {
    /** Unique plugin name */
    name: string;

    /** Setup function called during initialization */
    setup: (ctx: PluginContext) => void | Promise<void>;

    /** Plugin-specific configuration (preserved for reference) */
    config?: unknown;

    /**
     * Optional CLI registration
     * 
     * Plugin receives the CLI bridge API to register namespaced hooks.
     * CLI lifecycle hooks: 'cli:*' (owned by CLI)
     * Plugin hooks: '<namespace>:*' (owned by plugin)
     * 
     * @example
     * registerCLI(api) {
     *   api.on('cli:runtime:collect', (ctx) => {
     *     return { namespace: 'myPlugin', payload: ctx.getPluginData('myPlugin') }
     *   })
     * }
     */
    registerCLI?: (api: CLIBridgeAPI) => void;
}

// ============================================
// Main Config Types
// ============================================

/**
 * Zenith configuration object
 */
export interface ZenithConfig {
    /** List of plugins to load */
    plugins?: ZenithPlugin[];
}

/**
 * Define a Zenith configuration with full type safety
 */
export function defineConfig(config: ZenithConfig): ZenithConfig {
    return config;
}
