/**
 * Zenith File Parser (Native Bridge)
 * 
 * Delegates all Zenith compilation to the Rust native "syscall" bridge.
 * Zero fallbacks. Zero runtime abstraction.
 */

import { readFileSync } from 'fs'
import type { ZenIR } from './ir/types'
import { CompilerError } from './errors/compilerError'

let native: any
try {
    native = require('../native/compiler-native')
} catch (e) {
    // If not in standard node_modules, check build output
    try {
        native = require('../native/compiler-native/index.js')
    } catch {
        // FATAL: The native bridge is a requirement, not an enhancement.
        console.error('\n\x1b[31m[Zenith Critical] Native bridge unavailable.\x1b[0m');
        console.error('The Zenith compiler requires the Rust-based native bridge to function.');
        console.error('Please run "bun run build:native" in the zenith-compiler directory.\n');
        process.exit(1);
    }
}

export interface ParseOptions {
    mode?: 'metadata' | 'full'
    components?: Record<string, any>
    layout?: any
    props?: Record<string, any>
    useCache?: boolean
}

/**
 * Perform a Zenith "Syscall" to the native compiler
 */
export function parseZenFile(filePath: string, sourceInput?: string, options: ParseOptions = {}): any {
    const source = sourceInput ?? readFileSync(filePath, 'utf-8');

    // Default to full mode unless specified (e.g. for metadata extraction during discovery)
    const mode = options.mode ?? 'full';
    const useCache = options.useCache ?? (process.env.ZENITH_CACHE !== '0');

    if (!native.parseFullZenNative) {
        throw new Error('[Zenith Critical] Broken native bridge: parseFullZenNative symbol missing. Rebuild required.');
    }

    try {
        // Pass options as JSON string to avoid napi-rs undefined handling issues
        const nativeOptions = {
            mode: mode,
            useCache: useCache,
            components: options.components ?? null,
            layout: options.layout ?? null,
            props: options.props ?? null,
        };

        const result = native.parseFullZenNative(source, filePath, JSON.stringify(nativeOptions));
        return result;
    } catch (error: any) {
        // Native panic or unhandled error
        throw new Error(`[Zenith Native Fatal] ${error.message}\nFile: ${filePath}`);
    }
}
