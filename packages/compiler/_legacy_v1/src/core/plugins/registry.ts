/**
 * Zenith Plugin Registry
 * 
 * Manages plugin registration and initialization
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 * HOOK OWNERSHIP RULE (CANONICAL)
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * The plugin registry is part of core infrastructure.
 * It MUST remain plugin-agnostic:
 *   - No plugin-specific types
 *   - No plugin-specific logic
 *   - Generic data handling only
 * 
 * Plugins own their data structures; core provides the storage mechanism.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { ZenithPlugin, PluginContext } from '../config/types';

/**
 * Global plugin data store
 * 
 * Plugins store their data here using namespaced keys.
 * Core does not interpret this data - it just stores and serves it.
 */
const pluginDataStore: Record<string, unknown[]> = {};

/**
 * Get all plugin data (for runtime access)
 */
export function getPluginData(): Record<string, unknown[]> {
    return { ...pluginDataStore };
}

/**
 * Get plugin data by namespace
 */
export function getPluginDataByNamespace(namespace: string): unknown[] {
    return pluginDataStore[namespace] || [];
}

/**
 * Plugin registry for managing Zenith plugins
 */
export class PluginRegistry {
    private plugins = new Map<string, ZenithPlugin>();

    /**
     * Register a plugin
     */
    register(plugin: ZenithPlugin): void {
        if (this.plugins.has(plugin.name)) {
            console.warn(`[Zenith] Plugin "${plugin.name}" is already registered. Overwriting.`);
        }
        this.plugins.set(plugin.name, plugin);
    }

    /**
     * Get a plugin by name
     */
    get(name: string): ZenithPlugin | undefined {
        return this.plugins.get(name);
    }

    /**
     * Check if a plugin is registered
     */
    has(name: string): boolean {
        return this.plugins.has(name);
    }

    /**
     * Get all registered plugins
     */
    all(): ZenithPlugin[] {
        return Array.from(this.plugins.values());
    }

    /**
     * Initialize all plugins with the provided context
     */
    async initAll(ctx: PluginContext): Promise<void> {
        for (const plugin of this.plugins.values()) {
            try {
                await plugin.setup(ctx);

            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                console.error(`[Zenith] Failed to initialize plugin "${plugin.name}":`, message);
            }
        }
    }

    /**
     * Clear all registered plugins
     */
    clear(): void {
        this.plugins.clear();
        // Also clear plugin data
        for (const key of Object.keys(pluginDataStore)) {
            delete pluginDataStore[key];
        }
    }
}

/**
 * Create a plugin context for initialization
 * 
 * Uses a generic data setter that stores data by namespace.
 * Plugins define their own data structures internally.
 * 
 * @param projectRoot - Absolute path to the project root
 * @returns A PluginContext for plugin initialization
 */
export function createPluginContext(projectRoot: string): PluginContext {
    return {
        projectRoot,
        setPluginData: (namespace: string, data: unknown[]) => {
            pluginDataStore[namespace] = data;
        },
        options: {}
    };
}

