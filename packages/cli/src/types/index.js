import { generateEnvDts } from './generate-env-dts.js';
import { generateRoutesDts } from './generate-routes-dts.js';
import { join } from 'node:path';
import { access, constants } from 'node:fs/promises';

/**
 * @typedef {typeof globalThis & { __zenithTypesWarned?: boolean }} ZenithTypesGlobal
 */

/**
 * @param {string} projectRoot
 * @param {Array<{ path?: string }>} [manifest]
 * @returns {Promise<void>}
 */
export async function ensureZenithTypes(projectRoot, manifest) {
    try {
        await generateEnvDts(projectRoot);
        if (manifest) {
            await generateRoutesDts(projectRoot, manifest);
        }

        // Check if tsconfig.json exists, if it does, check if .zenith is included
        const tsconfigPath = join(projectRoot, 'tsconfig.json');
        let hasTsConfig = false;
        try {
            await access(tsconfigPath, constants.F_OK);
            hasTsConfig = true;
        } catch {
            hasTsConfig = false;
        }

        if (hasTsConfig) {
            // In a real implementation this would parse the JSON and check "include".
            // For now, we simply inform the user to include it if they haven't.
            /** @type {ZenithTypesGlobal} */
            const globalScope = globalThis;
            if (!globalScope.__zenithTypesWarned) {
                console.warn('\\x1b[33m[zenith]\\x1b[0m For the best TypeScript experience, ensure ".zenith/**/*.d.ts" is in your tsconfig.json "include" array.');
                globalScope.__zenithTypesWarned = true;
            }
        }
    } catch (err) {
        console.error('[zenith] Failed to generate type definitions:', err);
    }
}
