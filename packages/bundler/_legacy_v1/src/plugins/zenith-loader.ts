/**
 * Zenith Loader Plugin for Rolldown
 * 
 * Implements the "CSS Inject & Cache" pattern to ensure component CSS
 * is bundled alongside JS when processing .zen files.
 * 
 * Flow:
 * 1. Transform: Compile .zen → get JS + CSS
 * 2. Cache CSS in memory (keyed by file path)
 * 3. Inject `import "./Component.zen.css"` into JS
 * 4. Load: Serve virtual CSS from cache
 */

import { compile } from '@zenithbuild/compiler'
import fs from 'fs'


// CSS cache: key = file path, value = CSS content
const cssCache = new Map<string, string>()

// Export for external access (e.g., dev server CSS collection)
export function getCollectedCss(): string {
    return Array.from(cssCache.values()).join('\n\n')
}

export function clearCssCache(): void {
    cssCache.clear()
}

/**
 * Create the Zenith Loader plugin for Rolldown/Bun bundler
 */
/**
 * Create the Zenith Loader plugin for Rolldown/Bun bundler
 */
export function zenithLoader(options: {
    components?: Map<string, any>;
    root?: string;
    onStyle?: (css: string) => void;
    onHtml?: (html: string, filePath: string) => void;
}) {
    return {
        name: 'zenith-loader',

        /**
         * RESOLVE: Handle .zen and .zen.css virtual modules
         */
        resolveId(source: string, importer?: string) {
            if (source.endsWith('.zen')) {
                // Trick Rolldown into using TS loader by appending .tsx
                console.error(`[zenith-loader] Resolve: ${source}`)
                return { id: source + '.tsx', external: false }
            }

            // Handle virtual .virtual.css imports (injected by transform)
            if (source.endsWith('.virtual.css')) {
                return { id: source, external: false }
            }

            return null
        },

        /**
         * LOAD: Serve virtual CSS from cache
         */
        load(id: string) {
            // Serve cached CSS for virtual .zen.virtual.css imports
            if (id.endsWith('.virtual.css')) {
                // If ID somehow includes .tsx (unlikely if import used realId), strip it just in case
                const originalId = id.replace('.virtual.css', '').replace('.tsx', '')
                const css = cssCache.get(originalId)
                return css || '/* No CSS for this component */'
            }

            // Load .zen files from disk when requested as .zen.tsx
            if (id.endsWith('.zen.tsx')) {
                const realPath = id.slice(0, -4)
                if (fs.existsSync(realPath)) {
                    return fs.readFileSync(realPath, 'utf-8')
                }
            }

            return null
        },

        /**
         * TRANSFORM: Compile .zen files and inject CSS imports
         */
        async transform(code: string, id: string) {
            // Only transform the virtual .tsx files we created
            if (!id.endsWith('.zen.tsx')) return null

            const realId = id.slice(0, -4)
            console.error(`[zenith-loader] Transforming ${realId}`)
            console.log("PHASE 4 LOADER HIT", realId)

            // Verification Log: Check if components are passed
            console.log("LOADER COMPONENTS", options?.components?.size || 0)

            try {
                // Compile via Zenith compiler
                // Pass components map to compiler for expansion
                const result = await compile(code, realId, {
                    components: options?.components
                })

                if (!result.finalized) {
                    throw new Error(`Compilation failed for ${realId}`)
                }

                // Verification Log: Check IR expansion
                console.log("IR AFTER EXPANSION", {
                    nodes: result.ir?.template?.nodes?.length || 0,
                    expressions: result.ir?.template?.expressions?.length || 0
                })

                // Extract JS, CSS, and HTML
                let js = result.finalized.js || ''
                console.log(`[zenith-loader] JS Preview for ${realId}:`, js.slice(0, 100) + ' ... ' + js.slice(-100));
                console.log(`[zenith-loader] Has Registry?`, js.includes('window.__ZENITH_EXPRESSIONS__'));
                const css = result.finalized.styles || ''
                const html = result.finalized.html || ''

                console.log(`[zenith-loader] HTML from compile: length=${html.length}, keys=${Object.keys(result.finalized).join(',')}`);
                console.log(`[zenith-loader] compiled.html length=${result.compiled?.html?.length || 0}`);

                // Pass HTML via side-channel (same compilation = matching expression IDs)
                if (html && options.onHtml) {
                    options.onHtml(html, realId);
                } else if (result.compiled?.html && options.onHtml) {
                    // Fallback: try compiled.html
                    options.onHtml(result.compiled.html, realId);
                }

                // (Removed: Previously stripped trailing "}" which destroyed compiled output)


                // FIX START: Strip manual 'zenith:core' imports if they conflict with the Native Authority Bundle
                // The Native Compiler injects: import { signal as zenSignal, ... } from "@zenithbuild/runtime"
                // This clashes if the user script has: import { zenSignal } from "zenith:core"
                // Remove the user's import, relying on the injected one.
                js = js.replace(/import\s+\{.*zenSignal.*\}\s+from\s+["']zenith:core["'];?/g, '// $&');
                // FIX END

                // CRITICAL FIX: Cache CSS and inject virtual import
                let finalCode = js

                // Add component styles if any
                if (css) {
                    if (options.onStyle) {
                        options.onStyle(css);
                    }

                    // Always cache internally for virtual imports
                    cssCache.set(realId, css)

                    // Inject virtual CSS import so Rolldown includes it
                    // Must end in .css for Rolldown to treat as asset
                    finalCode = `import "${realId}.virtual.css";\n${js}`
                }

                // No extra export needed — compiler bundle is self-contained

                return {
                    code: finalCode,
                    map: null
                }

            } catch (e) {
                console.error(`[zenith-loader] Failed to compile ${realId}:`, e)
                throw e
            }
        }
    }
}

export default zenithLoader
