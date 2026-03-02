/**
 * Zenith Config Loader
 * 
 * Loads zenith.config.ts from the project root
 */

import fs from 'node:fs';
import path from 'node:path';
import type { ZenithConfig } from './types';

/**
 * Load zenith.config.ts from the project root
 * 
 * @param projectRoot - Absolute path to the project root
 * @returns Parsed ZenithConfig or empty config if not found
 */
export async function loadZenithConfig(projectRoot: string): Promise<ZenithConfig> {
    // Check for TypeScript config first, then JavaScript
    const configPaths = [
        path.join(projectRoot, 'zenith.config.ts'),
        path.join(projectRoot, 'zenith.config.js'),
        path.join(projectRoot, 'zenith.config.mjs'),
    ];

    let configPath: string | null = null;
    for (const p of configPaths) {
        if (fs.existsSync(p)) {
            configPath = p;
            break;
        }
    }

    if (!configPath) {
        // No config file found, return empty config
        return { plugins: [] };
    }

    try {
        // Use dynamic import to load the config
        // Bun supports importing TS files directly
        const configModule = await import(configPath);
        const config = configModule.default || configModule;

        // Validate basic structure
        if (typeof config !== 'object' || config === null) {
            console.warn(`[Zenith] Invalid config format in ${configPath}`);
            return { plugins: [] };
        }

        return config as ZenithConfig;
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[Zenith] Failed to load config from ${configPath}:`, message);
        return { plugins: [] };
    }
}

/**
 * Check if a zenith.config.ts exists in the project
 */
export function hasZenithConfig(projectRoot: string): boolean {
    const configPaths = [
        path.join(projectRoot, 'zenith.config.ts'),
        path.join(projectRoot, 'zenith.config.js'),
        path.join(projectRoot, 'zenith.config.mjs'),
    ];

    return configPaths.some(p => fs.existsSync(p));
}
