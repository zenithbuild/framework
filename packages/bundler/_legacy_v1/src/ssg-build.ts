/**
 * Zenith SSG Build System
 * 
 * SSG-first (Static Site Generation) build system that outputs:
 * - Per-page HTML files: dist/{route}/index.html
 * - Shared runtime: dist/assets/bundle.js
 * - Global styles: dist/assets/styles.css
 * - Page-specific JS only for pages needing hydration: dist/assets/page_{name}.js
 * 
 * Static pages get pure HTML+CSS, no JavaScript.
 * Hydrated pages reference the shared bundle.js and their page-specific JS.
 */

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CLI HARDENING: BLIND ORCHESTRATOR PATTERN
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * This build system uses the plugin bridge pattern:
 * - Plugins are initialized unconditionally
 * - Data is collected via 'cli:runtime:collect' hook
 * - CLI never inspects or branches on plugin data
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import fs from "fs"
import { compile } from "@zenithbuild/compiler"
import { discoverComponents } from "./discovery/componentDiscovery"
import { discoverPages, generateRouteDefinition } from "@zenithbuild/router/manifest"
import { analyzePageSource, getAnalysisSummary, getBuildOutputType, type PageAnalysis } from "./build-analyzer"
import { generateBundleJS } from "./bundle-generator"
import { compileCss, resolveGlobalsCss } from "./css"
import { loadZenithConfig } from "@zenithbuild/compiler"
import { PluginRegistry, createPluginContext, getPluginDataByNamespace } from "@zenithbuild/compiler"
import {
    createBridgeAPI,
    collectHookReturns,
    buildRuntimeEnvelope,
    clearHooks,
    type HookContext
} from "@zenithbuild/compiler"
import { bundlePageScript } from "./bundler"
import type { BundlePlan } from "@zenithbuild/compiler"
import path from "path"

// ============================================
// Types
// ============================================

interface CompiledPage {
    /** Route path like "/" or "/about" or "/blog/:id" */
    routePath: string
    /** Original file path */
    filePath: string
    /** Compiled HTML content */
    html: string
    /** Page-specific JavaScript (empty if static) */
    pageScript: string
    /** Hoisted imports for the page script */
    pageImports: string
    /** Page styles */
    styles: string
    /** Route score for matching priority */
    score: number
    /** Dynamic route parameter names */
    paramNames: string[]
    /** Build analysis result */
    analysis: PageAnalysis
    /** Output directory relative to dist/ */
    outputDir: string
    /** Compiler-emitted bundling plan (if bundling required) */
    bundlePlan?: BundlePlan
    /** Discovered components map (needed for bundler/loader) */
    components?: Map<string, any>
    /** Path to the layout wrapper */
    layoutPath?: string
}

export interface SSGBuildOptions {
    /** Pages directory (e.g., app/pages) */
    pagesDir: string
    /** Output directory (e.g., app/dist) */
    outDir: string
    /** Base directory for components/layouts (e.g., app/) */
    baseDir?: string
    /** Include source maps */
    sourceMaps?: boolean
}

// ============================================
// Page Compilation
// ============================================

/**
 * Compile a single page file for SSG output
 */
async function compilePage(
    pagePath: string,
    pagesDir: string,
    baseDir: string = process.cwd()
): Promise<CompiledPage> {
    const source = fs.readFileSync(pagePath, 'utf-8')

    // Analyze page requirements
    const analysis = analyzePageSource(source)

    // Determine source directory relative to pages (e.g., 'src' or 'app' or root)
    const srcDir = path.dirname(pagesDir)

    // Discover components & layouts
    const componentsDir = path.join(srcDir, 'components')
    const layoutsDir = path.join(srcDir, 'layouts')
    const components = new Map<string, any>()

    if (fs.existsSync(componentsDir)) {
        const comps = discoverComponents(componentsDir)
        for (const [k, v] of comps) components.set(k, v)
    }

    // Fix: Discover logic for Layout Reuse
    const layoutsMap = new Map<string, { path: string, template: string }>();
    if (fs.existsSync(layoutsDir)) {
        // Re-use discoverComponents for basic file finding
        const layoutComps = discoverComponents(layoutsDir)
        for (const [k, v] of layoutComps) {
            // Start with uppercase = component
            if (k[0] === k[0]?.toUpperCase()) {
                components.set(k, v)
                // Also store as layout
                layoutsMap.set(k, { path: v.path, template: fs.readFileSync(v.path, 'utf-8') });
            }
        }
    }

    // Determine Layout
    const relativePath = path.relative(path.join(srcDir, 'pages'), pagePath)
    const layouts = Array.from(layoutsMap.values())
    const layout = layouts.find(l => {
        const layoutRelative = path.dirname(path.relative(layoutsDir, l.path))
        const pageRelative = path.dirname(path.relative(pagesDir, pagePath))
        return layoutRelative === pageRelative || layoutRelative === '.'
    })

    // Compile with unified pipeline
    const result = await compile(source, pagePath, {
        components,
        // layout: layoutToUse (handled by wrapper)
    })

    if (!result.finalized) {
        throw new Error(`Compilation failed for ${pagePath}: No finalized output`)
    }

    // Extract compiled output
    const html = result.finalized.html
    const js = result.finalized.js || ''
    const imports = result.finalized.npmImports || ''
    const styles = result.finalized.styles || ''

    // Generate route definition
    const routeDef = generateRouteDefinition(pagePath, pagesDir)

    // Determine output directory from route path
    // "/" -> "index", "/about" -> "about", "/blog/post" -> "blog/post"
    let outputDir = routeDef.path === '/' ? 'index' : routeDef.path.replace(/^\//, '')

    // Handle dynamic routes - they'll be placeholders for now
    // [id] segments become _id_ for folder names
    outputDir = outputDir.replace(/\[([^\]]+)\]/g, '_$1_')

    // Force hydration if we have compiled JS or if top-level analysis detected it
    const needsHydration = analysis.needsHydration || js.trim().length > 0

    return {
        routePath: routeDef.path,
        filePath: pagePath,
        html,
        pageScript: needsHydration ? js : '',
        pageImports: needsHydration ? imports : '',
        styles,
        score: routeDef.score,
        paramNames: routeDef.paramNames,
        analysis: {
            ...analysis,
            needsHydration,
            isStatic: !needsHydration && !analysis.needsSSR
        },
        outputDir,
        bundlePlan: result.finalized.bundlePlan,
        components, // Pass discovered components
        layoutPath: layout ? layout.path : undefined
    }
}

// ============================================
// HTML Generation
// ============================================

/**
 * Generate the final HTML for a page
 * Static pages: no JS references
 * Hydrated pages: bundle.js + page-specific JS
 * 
 * Uses the neutral __ZENITH_PLUGIN_DATA__ envelope - CLI never inspects contents.
 */
function generatePageHTML(page: CompiledPage, globalStyles: string, pluginEnvelope: Record<string, unknown>): string {
    const { html, styles, analysis, routePath, pageScript } = page

    // Combine styles - Page styles only, global is external
    const pageStyles = styles
    const allStyles = pageStyles

    // External Global Stylesheet
    const globalStylesheetLink = '<link rel="stylesheet" href="/assets/styles.css">'

    // Build script tags only if needed
    let scriptTags = ''
    if (analysis.needsHydration) {
        scriptTags = `
  <script type="module" src="/assets/bundle.js"></script>`

        if (pageScript) {
            // Generate a safe filename from route path
            const pageJsName = routePath === '/'
                ? 'page_index.js'
                : `page_${routePath.replace(/^\//, '').replace(/\//g, '_')}.js`
            scriptTags += `
  <script type="module" src="/assets/${pageJsName}"></script>`
        }
    }

    // Check if HTML already has full document structure
    const hasHtmlTag = /<html[^>]*>/i.test(html)

    if (hasHtmlTag) {
        // HTML already has structure from layout - inject styles and scripts
        let finalHtml = html

        // Inject styles into <head> if not already there
        if (!/<style[^>]*>/.test(finalHtml)) {
            finalHtml = finalHtml.replace(
                '</head>',
                `  ${globalStylesheetLink}\n  <style>\n${allStyles}\n  </style>\n</head>`
            )
        }

        // Inject scripts before </body>
        if (scriptTags) {
            finalHtml = finalHtml.replace(
                '</body>',
                `${scriptTags}\n</body>`
            )
        }

        return finalHtml
    }

    // Generate full HTML document for pages without layout
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zenith App</title>
  <script type="importmap">
    {
      "imports": {
        "@zenithbuild/core": "/assets/bundle.js",
        "@zenithbuild/router": "/assets/bundle.js",
        "@zenithbuild/runtime": "/assets/bundle.js"
      }
    }
  </script>
  ${globalStylesheetLink}
  <style>
${allStyles}
  </style>
</head>
<body>
${html}${scriptTags}
</body>
</html>`
}

// ============================================
// Asset Generation
// ============================================

/**
 * Generate page-specific JavaScript
 */
function generatePageJS(page: CompiledPage): string {
    if (!page.pageScript) return ''

    // Module imports must be top-level
    return `// Zenith Page: ${page.routePath}
// Phase 5: ES Module Mode

${page.pageScript}

// Trigger hydration after DOM is ready
(function() {
  function trigger() {
      if (window.__zenith && window.__zenith.triggerMount) {
        window.__zenith.triggerMount();
      }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trigger);
  } else {
    trigger();
  }
})();
`
}

// ============================================
// Main Build Function
// ============================================

/**
 * Build all pages using SSG approach
 * 
 * Follows the blind orchestrator pattern:
 * - Plugins are initialized unconditionally
 * - Data is collected via hooks
 * - CLI never inspects plugin data
 */
export async function buildSSG(options: SSGBuildOptions): Promise<void> {
    const { pagesDir, outDir, baseDir = path.dirname(pagesDir) } = options

    console.log('🔨 Zenith SSG Build')
    console.log(`   Pages: ${pagesDir}`)
    console.log(`   Output: ${outDir}`)
    console.log('')

    // ============================================
    // Plugin Initialization (Unconditional)
    // ============================================
    // Load config and initialize all plugins without checking which ones exist.
    const config = await loadZenithConfig(baseDir)
    const registry = new PluginRegistry()
    const bridgeAPI = createBridgeAPI()

    // Clear any previously registered hooks
    clearHooks()

    // Register ALL plugins unconditionally
    for (const plugin of config.plugins || []) {
        console.log(`   Plugin: ${plugin.name}`)
        registry.register(plugin)

        // Let plugin register its CLI hooks
        if (plugin.registerCLI) {
            plugin.registerCLI(bridgeAPI)
        }
    }

    // Initialize all plugins
    await registry.initAll(createPluginContext(baseDir))

    // Create hook context - CLI provides this but NEVER uses getPluginData itself
    const hookCtx: HookContext = {
        projectRoot: baseDir,
        getPluginData: getPluginDataByNamespace
    }

    // Collect runtime payloads from ALL plugins
    const payloads = await collectHookReturns('cli:runtime:collect', hookCtx)
    const pluginEnvelope = buildRuntimeEnvelope(payloads)

    console.log('')

    // Clean and create output directory
    if (fs.existsSync(outDir)) {
        fs.rmSync(outDir, { recursive: true, force: true })
    }
    fs.mkdirSync(outDir, { recursive: true })
    fs.mkdirSync(path.join(outDir, 'assets'), { recursive: true })

    // Discover pages
    const pageFiles = discoverPages(pagesDir)

    if (pageFiles.length === 0) {
        console.warn('⚠️ No pages found in', pagesDir)
        return
    }

    console.log(`📄 Found ${pageFiles.length} page(s)`)

    // Compile all pages
    const compiledPages: CompiledPage[] = []
    let hasHydratedPages = false

    for (const pageFile of pageFiles) {
        const relativePath = path.relative(pagesDir, pageFile)
        console.log(`   Compiling: ${relativePath}`)

        try {
            const compiled = await compilePage(pageFile, pagesDir, baseDir)
            compiledPages.push(compiled)

            if (compiled.analysis.needsHydration) {
                hasHydratedPages = true
            }

            const outputType = getBuildOutputType(compiled.analysis)
            const summary = getAnalysisSummary(compiled.analysis)

            // Check if it's "forced" hydration (analysis missed it, but compiler found JS)
            const logType = outputType.toUpperCase()
            console.log(`     → ${logType} [${summary}]`)
        } catch (error: any) {
            console.error(`   ❌ Error: ${error.message}`)
            throw error
        }
    }

    console.log('')

    // Compile global styles (Tailwind CSS)
    let globalStyles = ''
    const globalsCssPath = resolveGlobalsCss(baseDir)
    if (globalsCssPath) {
        console.log('📦 Compiling CSS:', path.relative(baseDir, globalsCssPath))
        const cssOutputPath = path.join(outDir, 'assets', 'styles.css')
        const result = compileCss({
            input: globalsCssPath,
            output: cssOutputPath,
            minify: true
        })
        if (result.success) {
            globalStyles = result.css
            console.log(`📦 Generated assets/styles.css (${result.duration}ms)`)
        } else {
            console.error('❌ CSS compilation failed:', result.error)
        }
    }

    // Write bundle.js if any pages need hydration
    if (hasHydratedPages) {
        const bundleJS = generateBundleJS(pluginEnvelope)
        fs.writeFileSync(path.join(outDir, 'assets', 'bundle.js'), bundleJS)
        console.log('📦 Generated assets/bundle.js (with plugin data)')
    }

    // Write each page
    for (const page of compiledPages) {
        // Create output directory
        const pageOutDir = path.join(outDir, page.outputDir)
        fs.mkdirSync(pageOutDir, { recursive: true })

        // Generate and write HTML
        const html = generatePageHTML(page, globalStyles, pluginEnvelope)
        fs.writeFileSync(path.join(pageOutDir, 'index.html'), html)

        // Write page-specific JS if needed
        if (page.pageScript) {
            const pageJsName = page.routePath === '/'
                ? 'page_index.js'
                : `page_${page.routePath.replace(/^\//, '').replace(/\//g, '_')}.js`
            const pageJS = generatePageJS(page)

            if (page.routePath === '/' && pageJS.includes('</a>')) {
                console.log('🚨 LEAKED JSX DETECTED IN INDEX.ZEN:')
                // print relevant lines
                const lines = pageJS.split('\n');
                lines.forEach((line, i) => {
                    if (line.includes('</a>')) {
                        console.log(`${i + 1}: ${line.trim()}`)
                    }
                })
            }

            // Bundle ONLY if compiler emitted a BundlePlan (no inference)
            // Use unified bundler API
            // Bundle ONLY if compiler emitted a BundlePlan (no inference)
            // Use unified bundler API
            const bundleResult = await bundlePageScript({
                pagePath: page.filePath,
                root: baseDir,
                components: page.components,
                layoutPath: page.layoutPath // Fix: Pass layout path
            })
            const bundledJS = bundleResult.code
            fs.writeFileSync(path.join(outDir, 'assets', pageJsName), bundledJS)
        }

        console.log(`✅ ${page.outputDir}/index.html`)
    }

    // Copy favicon if exists
    const faviconPath = path.join(baseDir, 'favicon.ico')
    if (fs.existsSync(faviconPath)) {
        fs.copyFileSync(faviconPath, path.join(outDir, 'favicon.ico'))
        console.log('📦 Copied favicon.ico')
    }

    // Generate 404 page
    const custom404Candidates = ['404.zen', '+404.zen', 'not-found.zen']
    let has404 = false

    for (const candidate of custom404Candidates) {
        const custom404Path = path.join(pagesDir, candidate)
        if (fs.existsSync(custom404Path)) {
            try {
                const compiled = await compilePage(custom404Path, pagesDir, baseDir)
                const html = generatePageHTML(compiled, globalStyles, pluginEnvelope)
                fs.writeFileSync(path.join(outDir, '404.html'), html)
                console.log('📦 Generated 404.html (custom)')
                has404 = true
                if (compiled.pageScript) {
                    const pageJS = generatePageJS(compiled)
                    const bundleResult = await bundlePageScript({
                        pagePath: custom404Path,
                        root: baseDir,
                        components: compiled.components,
                        layoutPath: compiled.layoutPath
                    })
                    const bundledJS = bundleResult.code
                    fs.writeFileSync(path.join(outDir, 'assets', 'page_404.js'), bundledJS)
                }
            } catch (error: any) {
                console.warn(`   ⚠️ Could not compile ${candidate}: ${error.message}`)
            }
            break
        }
    }

    if (!has404) {
        const default404HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page Not Found | Zenith</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #f1f5f9; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .container { text-align: center; padding: 2rem; }
    .error-code { font-size: 8rem; font-weight: 800; background: linear-gradient(135deg, #3b82f6, #06b6d4); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; line-height: 1; margin-bottom: 1rem; }
    h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 1rem; color: #e2e8f0; }
    .message { color: #94a3b8; margin-bottom: 2rem; }
    a { display: inline-block; background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 8px; font-weight: 500; }
  </style>
</head>
<body>
  <div class="container">
    <div class="error-code">404</div>
    <h1>Page Not Found</h1>
    <p class="message">The page you're looking for doesn't exist.</p>
    <a href="/">← Go Home</a>
  </div>
</body>
</html>`
        fs.writeFileSync(path.join(outDir, '404.html'), default404HTML)
        console.log('📦 Generated 404.html (default)')
    }

    // Summary
    console.log('')
    console.log('✨ Build complete!')
    console.log(`   Static pages: ${compiledPages.filter(p => p.analysis.isStatic).length}`)
    console.log(`   Hydrated pages: ${compiledPages.filter(p => p.analysis.needsHydration).length}`)
    console.log(`   SSR pages: ${compiledPages.filter(p => p.analysis.needsSSR).length}`)
    console.log('')

    // Route manifest
    console.log('📍 Routes:')
    for (const page of compiledPages.sort((a, b) => b.score - a.score)) {
        const type = getBuildOutputType(page.analysis)
        console.log(`   ${page.routePath.padEnd(20)} → ${page.outputDir}/index.html (${type})`)
    }
}
