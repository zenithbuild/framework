import { join } from 'path';
import { existsSync } from 'fs';

// Simple native loader compliant with "No new dependencies" rule
function loadNative() {
    try {
        // Try local dev path first (root of package)
        const localPath = join(__dirname, '../../index.node');
        if (existsSync(localPath)) return require(localPath);

        // Try dist path (sibling to dist folder)
        const distPath = join(__dirname, '../index.node');
        if (existsSync(distPath)) return require(distPath);

        // Fallback to standard release name if needed (simplified)
        return require('../index.node');
    } catch (e) {
        console.error('[Zenith Bundler] Failed to load native bindings:', e);
        return {};
    }
}

const bindings = loadNative();

export const ZenithDevController = bindings.ZenithDevController;
export const bundle = bindings.bundle;
export const generateRuntimeNative = bindings.generateRuntime; // Renamed to avoid conflict with TS implementation
export const analyzeManifest = bindings.analyze_manifest; // Snake case from Rust map to camel? usually napi does it.
// Actually napi-rs converts snake_case to camelCase by default for exports.
// So `generate_runtime` -> `generateRuntime`.
// `analyze_manifest` -> `analyzeManifest`.
