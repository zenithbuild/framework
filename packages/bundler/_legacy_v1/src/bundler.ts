/**
 * @zenithbuild/bundler - Page Script Bundler
 * 
 * COMPILER-FIRST ARCHITECTURE
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * This bundler performs ZERO inference. It executes exactly what the compiler specifies.
 * 
 * Rules:
 * - If a BundlePlan is provided, bundling MUST occur
 * - If bundling fails, throw a hard error (no fallback)
 * - The bundler never inspects source code for intent
 * - No temp files, no heuristics, no recovery
 * 
 * Bundler failure = compiler bug.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { rolldown } from 'rolldown'
import path from 'path'
import { createRequire } from 'module'
import type { BundlePlan } from '@zenithbuild/compiler'
import { zenithLoader } from './plugins/zenith-loader'

/**
 * Execute a compiler-emitted BundlePlan
 * 
 * This is a PURE PLAN EXECUTOR. It does not:
 * - Inspect source code for imports
 * - Decide whether bundling is needed
 * - Fall back on failure
 * - Use temp files
 * 
 * @param plan - Compiler-emitted BundlePlan (must exist; caller must not call if no plan)
 * @throws Error if bundling fails (no fallback, no recovery)
 */
// Cache helpers
let collectedCss = '';
export function getCollectedCss() { return collectedCss; }
export function clearCssCache() { collectedCss = ''; }

let collectedHtml = '';
export function getCollectedHtml() { return collectedHtml; }
export function clearHtmlCache() { collectedHtml = ''; }

// Helper to sanitize paths (Windows fix)
function sanitizePath(p: string) {
    return p.split(path.sep).join(path.posix.sep);
}

export async function bundlePageScript({
    pagePath,
    root,
    components,
    layoutPath
}: {
    pagePath: string;
    root: string;
    components?: Map<string, any>;
    layoutPath?: string;
}): Promise<{ code: string; html: string; layoutHtml?: string }> {
    collectedCss = '';
    collectedHtml = '';
    let capturedHtml = ''; // Local variable — avoids bun bundler module scope issues
    let capturedLayoutHtml = ''; // Capture compiled layout HTML
    const virtualEntryId = '\0zenith:virtual-entry';

    // Sanitize
    const cleanPagePath = sanitizePath(pagePath);
    const cleanLayoutPath = layoutPath ? sanitizePath(layoutPath) : undefined;

    // GENERATE RAW JS (Bypassing Compiler to avoid 'export' wrap error)
    let virtualJsCode = '';

    if (cleanLayoutPath) {
        virtualJsCode = `
            import Layout from "${cleanLayoutPath}";
            import Page from "${cleanPagePath}";
            
            // Re-export setup so the router can find it
            // Page is the Default Export from the compiler
            export const setup = Page.setup;

            const App = {
                setup: Page.setup,
                render: (props) => {
                    // Manual H Call (Matches Compiler Output Contract)
                    // <Layout><Page {...props} /></Layout>
                    return window.__zenith.h(Layout, null, [
                        window.__zenith.h(Page, props)
                    ]);
                }
            };
            if (typeof window !== 'undefined') window.__ZENITH_APP__ = App;
            export default App;
        `;
    } else {
        virtualJsCode = `
            import Page from "${cleanPagePath}";
            export const setup = Page.setup;
            const App = Page;
            if (typeof window !== 'undefined') window.__ZENITH_APP__ = App;
            export default App;
        `;
    }

    // Run Rolldown
    try {
        const bundle = await rolldown({
            input: virtualEntryId,
            platform: 'browser',
            external: ['@zenithbuild/runtime'], // CRITICAL: Prevent double-bundling
            resolve: {
                // Fix: Include node_modules for package resolution
                modules: [path.join(root, 'src'), root, path.join(root, 'node_modules'), 'node_modules'],
                extensions: ['.ts', '.tsx', '.js', '.jsx', '.zen', '.json'],
            },
            plugins: [
                {
                    name: 'zenith-virtual-wrapper',
                    resolveId(id) {
                        if (id === virtualEntryId) return id;
                        // Handle zenith:content -> /zenith-content.js (external)
                        if (id === 'zenith:content') {
                            return { id: '/zenith-content.js', external: true };
                        }
                        return null;
                    },
                    load(id) {
                        if (id === virtualEntryId) return virtualJsCode; // Serve JS directly
                        return null;
                    }
                },
                zenithLoader({
                    components,
                    onStyle: (css) => { collectedCss += css + '\n'; },
                    onHtml: (html, filePath) => {
                        console.error(`[bundler] onHtml called: filePath=${filePath}, pagePath=${pagePath}, cleanPagePath=${cleanPagePath}`);
                        // Capture HTML from the main page compilation
                        // Use endsWith for more permissive matching since paths may differ
                        const pageBase = pagePath.split('/').pop() || '';
                        if (filePath === pagePath || filePath === cleanPagePath || filePath.endsWith(pageBase)) {
                            capturedHtml = html;
                            collectedHtml = html;
                            console.error(`[bundler] HTML captured! length=${html.length}`);
                        }

                        // Capture Layout HTML too
                        if (layoutPath && (filePath === layoutPath || filePath === cleanLayoutPath)) {
                            capturedLayoutHtml = html;
                            console.error(`[bundler] Layout HTML captured! length=${html.length}`);
                        }
                    }
                })
            ],
            onLog(level, log) {
                if (log.code === 'UNRESOLVED_IMPORT') {
                    throw new Error(`[Zenith Bundler] Unresolved import: ${log.message}`)
                }
            }
        });

        const { output } = await bundle.generate({ format: 'esm' });
        return { code: output[0].code, html: capturedHtml, layoutHtml: capturedLayoutHtml };

    } catch (e) {
        console.error("Bundling failed:", e);
        throw e;
    }

}

/**
 * Bundle the Runtime into a single ESM file (Rolldown)
 * Bridges the Compiler-Runtime gap with a Virtual Adapter.
 */
export async function bundleRuntime(root: string): Promise<string> {
    const require = createRequire(path.join(root, 'package.json'));
    let runtimePath: string;
    try {
        runtimePath = require.resolve('@zenithbuild/runtime');
    } catch (e) {
        try {
            runtimePath = require.resolve('@zenithbuild/runtime', { paths: [root] });
        } catch (e2) {
            throw new Error(`[Zenith Bundler] Could not resolve @zenithbuild/runtime from ${root}`);
        }
    }

    // Phase 1.1: Sanitize Path for Virtual Module
    const cleanPath = sanitizePath(runtimePath);

    // Phase 1.2: Adapter Logic (The Shim)
    // We explicitly re-export everything. The runtime package DOES export 'hydrate'.
    // We remove the manual shim to avoid bundler confusion.
    const adapterCode = `
import * as r from "${cleanPath}";
export * from "${cleanPath}";

// Verify hydration exists (Dev only check)
if (typeof r.hydrate !== 'function') {
    console.warn("Zenith Runtime: hydrate() not found in exports", r);
}
`;

    // Phase 1.3: Rolldown Configuration
    const virtualEntryId = '\0zenith:runtime-adapter.js';

    try {
        const bundle = await rolldown({
            input: virtualEntryId,
            platform: 'browser',
            resolve: {
                conditionNames: ['import', 'browser', 'default']
            },
            plugins: [
                {
                    name: 'zenith-runtime-adapter',
                    resolveId(id) {
                        if (id === virtualEntryId) return id;
                        return null;
                    },
                    load(id) {
                        if (id === virtualEntryId) return adapterCode;
                        return null;
                    }
                }
            ],
            treeshake: true
        });

        const { output } = await bundle.generate({ format: 'esm' });

        if (!output[0]?.code) {
            throw new Error('[Zenith Bundler] Runtime bundle produced no output');
        }

        return output[0].code;
    } catch (e) {
        console.error("Runtime bundling failed:", e);
        throw e;
    }
}
