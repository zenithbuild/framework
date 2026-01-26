/**
 * @zenithbuild/cli - Dev Command
 * 
 * Development server with HMR support.
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 * CLI HARDENING: BLIND ORCHESTRATOR PATTERN
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * This file follows the CLI Hardening Plan:
 * - NO plugin-specific branching (no `if (hasContentPlugin)`)
 * - NO semantic helpers (no `getContentData()`)
 * - NO plugin type imports or casts
 * - ONLY opaque data forwarding via hooks
 * 
 * The CLI dispatches lifecycle hooks and collects payloads.
 * It never understands what the data means.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import path from 'path'
import fs from 'fs'
import { serve, type ServerWebSocket } from 'bun'
import { requireProject } from '../utils/project'
import * as logger from '../utils/logger'
import * as brand from '../utils/branding'
import {
    compileZenSource,
    discoverLayouts,
    processLayout,
    generateBundleJS,
    loadZenithConfig,
    PluginRegistry,
    createPluginContext,
    getPluginDataByNamespace,
    compileCssAsync,
    resolveGlobalsCss,
    createBridgeAPI,
    runPluginHooks,
    collectHookReturns,
    buildRuntimeEnvelope,
    clearHooks,
    type HookContext
} from '@zenithbuild/compiler'

export interface DevOptions {
    port?: number
}

interface CompiledPage {
    html: string
    script: string
    styles: string[]
    route: string
    lastModified: number
}

const pageCache = new Map<string, CompiledPage>()

/**
 * Bundle page script using Rolldown to resolve npm imports at compile time.
 * Only called when compiler emits a BundlePlan - bundler performs no inference.
 */
import { bundlePageScript, type BundlePlan, generateRouteDefinition } from '@zenithbuild/compiler'

export async function dev(options: DevOptions = {}): Promise<void> {
    const project = requireProject()
    const port = options.port || parseInt(process.env.PORT || '3000', 10)
    const pagesDir = project.pagesDir
    const rootDir = project.root

    // Load zenith.config.ts if present
    const config = await loadZenithConfig(rootDir)
    const registry = new PluginRegistry()
    const bridgeAPI = createBridgeAPI()

    // Clear any previously registered hooks (important for restarts)
    clearHooks()



    // ============================================
    // Plugin Registration (Unconditional)
    // ============================================
    // CLI registers ALL plugins without checking which ones exist.
    // Each plugin decides what hooks to register.
    for (const plugin of config.plugins || []) {

        registry.register(plugin)

        // Let plugin register its CLI hooks (if it wants to)
        // CLI does NOT check what the plugin is - it just offers the API
        if (plugin.registerCLI) {
            plugin.registerCLI(bridgeAPI)
        }
    }

    // ============================================
    // Plugin Initialization (Unconditional)
    // ============================================
    // Initialize ALL plugins unconditionally.
    // If no plugins, this is a no-op. CLI doesn't branch on plugin presence.
    await registry.initAll(createPluginContext(rootDir))

    // Create hook context - CLI provides this but NEVER uses getPluginData itself
    const hookCtx: HookContext = {
        projectRoot: rootDir,
        getPluginData: getPluginDataByNamespace
    }

    // Dispatch lifecycle hook - plugins decide if they care
    await runPluginHooks('cli:dev:start', hookCtx)

    // ============================================
    // CSS Compilation (Compiler-Owned)
    // ============================================
    const globalsCssPath = resolveGlobalsCss(rootDir)
    let compiledCss = ''

    if (globalsCssPath) {
        console.log('[Zenith] Compiling CSS:', path.relative(rootDir, globalsCssPath))
        const cssResult = await compileCssAsync({ input: globalsCssPath, output: ':memory:' })
        if (cssResult.success) {
            compiledCss = cssResult.css
            console.log(`[Zenith] CSS compiled in ${cssResult.duration}ms`)
        } else {
            console.error('[Zenith] CSS compilation failed:', cssResult.error)
        }
    }

    const clients = new Set<ServerWebSocket<unknown>>()

    // Branded Startup Panel
    brand.showServerPanel({
        project: project.root,
        pages: project.pagesDir,
        url: `http://localhost:${port}`,
        hmr: true,
        mode: 'In-memory compilation'
    })

    // File extensions that should be served as static assets
    const STATIC_EXTENSIONS = new Set([
        '.js', '.css', '.ico', '.png', '.jpg', '.jpeg', '.gif', '.svg',
        '.webp', '.woff', '.woff2', '.ttf', '.eot', '.json', '.map'
    ])

    /**
     * Compile a .zen page in memory
     */
    async function compilePageInMemory(pagePath: string): Promise<CompiledPage | null> {
        try {
            const layoutsDir = path.join(pagesDir, '../layouts')
            const componentsDir = path.join(pagesDir, '../components')
            const layouts = discoverLayouts(layoutsDir)
            const source = fs.readFileSync(pagePath, 'utf-8')

            let processedSource = source
            let layoutToUse = layouts.get('DefaultLayout')

            if (layoutToUse) processedSource = processLayout(source, layoutToUse)

            const result = await compileZenSource(processedSource, pagePath, {
                componentsDir: fs.existsSync(componentsDir) ? componentsDir : undefined
            })
            if (!result.finalized) throw new Error('Compilation failed')

            const routeDef = generateRouteDefinition(pagePath, pagesDir)



            // Safely strip imports from the top of the script
            // This relies on the fact that duplicate imports (from Rust codegen)
            // appear at the beginning of result.finalized.js
            let jsLines = result.finalized.js.split('\n')

            // Remove lines from top that are imports, whitespace, or comments
            while (jsLines.length > 0 && jsLines[0] !== undefined) {
                const line = jsLines[0].trim()
                if (
                    line.startsWith('import ') ||
                    line === '' ||
                    line.startsWith('//') ||
                    line.startsWith('/*') ||
                    line.startsWith('*')
                ) {
                    jsLines.shift()
                } else {
                    break
                }
            }

            let jsWithoutImports = jsLines.join('\n')

            // PATCH: Fix unquoted keys with dashes (Rust codegen bug in jsx_lowerer)
            // e.g. stroke-width: "1.5" -> "stroke-width": "1.5"
            // We only apply this to the JS portions (Script and Expressions)
            // to avoid corrupting the Styles section.
            const stylesMarker = '// 6. Styles injection'
            const parts = jsWithoutImports.split(stylesMarker)

            if (parts.length > 1) {
                // Apply patch only to the JS part
                parts[0] = parts[0]!.replace(
                    /(^|[{,])\s*([a-zA-Z][a-zA-Z0-9-]*-[a-zA-Z0-9-]*)\s*:/gm,
                    '$1"$2":'
                )
                jsWithoutImports = parts.join(stylesMarker)
            } else {
                // Fallback if marker not found
                jsWithoutImports = jsWithoutImports.replace(
                    /(^|[{,])\s*([a-zA-Z][a-zA-Z0-9-]*-[a-zA-Z0-9-]*)\s*:/gm,
                    '$1"$2":'
                )
            }

            // Combine: structured imports first, then cleaned script body
            const fullScript = (result.finalized.npmImports || '') + '\n\n' + jsWithoutImports



            // Bundle ONLY if compiler emitted a BundlePlan (no inference)
            let bundledScript = fullScript
            if (result.finalized.bundlePlan) {
                // Compiler decided bundling is needed - pass plan with proper resolve roots
                const plan: BundlePlan = {
                    ...result.finalized.bundlePlan,
                    entry: fullScript,
                    resolveRoots: [path.join(rootDir, 'node_modules'), 'node_modules']
                }
                bundledScript = await bundlePageScript(plan)
            }

            return {
                html: result.finalized.html,
                script: bundledScript,
                styles: result.finalized.styles,
                route: routeDef.path,
                lastModified: Date.now()
            }
        } catch (error: any) {
            logger.error(`Compilation error: ${error.message}`)
            return null
        }
    }

    /**
     * Generate dev HTML with plugin data envelope
     * 
     * CLI collects payloads from plugins via 'cli:runtime:collect' hook.
     * It serializes blindly - never inspecting what's inside.
     */
    async function generateDevHTML(page: CompiledPage): Promise<string> {
        // Single neutral injection point
        const runtimeTag = `<script src="/runtime.js"></script>`
        const scriptTag = `<script type="module">\n${page.script}\n</script>`
        const allScripts = `${runtimeTag}\n${scriptTag}`

        let html = page.html.includes('</body>')
            ? page.html.replace('</body>', `${allScripts}\n</body>`)
            : `${page.html}\n${allScripts}`

        // Ensure DOCTYPE is present to prevent Quirks Mode (critical for SVG namespace)
        if (!html.trimStart().toLowerCase().startsWith('<!doctype')) {
            html = `<!DOCTYPE html>\n${html}`
        }

        return html
    }

    // ============================================
    // File Watcher (Plugin-Agnostic)
    // ============================================
    // CLI watches files but delegates decisions to plugins via hooks.
    // No branching on file types that are "content" vs "not content".
    const watcher = fs.watch(path.join(pagesDir, '..'), { recursive: true }, async (event, filename) => {
        if (!filename) return

        // Dispatch file change hook to ALL plugins
        // Each plugin decides if it cares about this file
        await runPluginHooks('cli:dev:file-change', {
            ...hookCtx,
            filename,
            event
        })

        if (filename.endsWith('.zen')) {
            logger.hmr('Page', filename)

            // Clear page cache to force fresh compilation on next request
            pageCache.clear()

            // Recompile CSS for new Tailwind classes in .zen files
            if (globalsCssPath) {
                const cssResult = await compileCssAsync({ input: globalsCssPath, output: ':memory:' })
                if (cssResult.success) {
                    compiledCss = cssResult.css
                }
            }

            // Broadcast page reload AFTER cache cleared and CSS ready
            for (const client of clients) {
                client.send(JSON.stringify({ type: 'reload' }))
            }
        } else if (filename.endsWith('.css')) {
            logger.hmr('CSS', filename)
            // Recompile CSS
            if (globalsCssPath) {
                const cssResult = await compileCssAsync({ input: globalsCssPath, output: ':memory:' })
                if (cssResult.success) {
                    compiledCss = cssResult.css
                }
            }
            for (const client of clients) {
                client.send(JSON.stringify({ type: 'style-update', url: '/assets/styles.css' }))
            }
        } else {
            // For all other file changes, re-initialize plugins unconditionally
            // Plugins decide internally whether they need to reload data
            // CLI does NOT branch on "is this a content file"
            await registry.initAll(createPluginContext(rootDir))

            // Broadcast reload for any non-code file changes
            for (const client of clients) {
                client.send(JSON.stringify({ type: 'reload' }))
            }
        }
    })

    const server = serve({
        port,
        async fetch(req, server) {
            const startTime = performance.now()
            const url = new URL(req.url)
            const pathname = url.pathname
            const ext = path.extname(pathname).toLowerCase()

            // Upgrade to WebSocket for HMR
            if (pathname === '/hmr') {
                const upgraded = server.upgrade(req)
                if (upgraded) return undefined
            }

            // Handle Zenith assets
            if (pathname === '/runtime.js') {
                // Collect runtime payloads from ALL plugins
                const payloads = await collectHookReturns('cli:runtime:collect', hookCtx)
                const envelope = buildRuntimeEnvelope(payloads)

                const response = new Response(generateBundleJS(envelope), {
                    headers: { 'Content-Type': 'application/javascript; charset=utf-8' }
                })
                logger.route('GET', pathname, 200, Math.round(performance.now() - startTime), 0, Math.round(performance.now() - startTime))
                return response
            }

            // Serve compiler-owned CSS (Tailwind compiled)
            if (pathname === '/assets/styles.css') {
                const response = new Response(compiledCss, {
                    headers: { 'Content-Type': 'text/css; charset=utf-8' }
                })
                logger.route('GET', pathname, 200, Math.round(performance.now() - startTime), 0, Math.round(performance.now() - startTime))
                return response
            }

            // Legacy: also support /styles/globals.css or /styles/global.css for backwards compat
            if (pathname === '/styles/globals.css' || pathname === '/styles/global.css') {
                const response = new Response(compiledCss, {
                    headers: { 'Content-Type': 'text/css; charset=utf-8' }
                })
                logger.route('GET', pathname, 200, Math.round(performance.now() - startTime), 0, Math.round(performance.now() - startTime))
                return response
            }

            // Static files
            if (STATIC_EXTENSIONS.has(ext)) {
                const publicPath = path.join(pagesDir, '../public', pathname)
                if (fs.existsSync(publicPath)) {
                    const response = new Response(Bun.file(publicPath))
                    logger.route('GET', pathname, 200, Math.round(performance.now() - startTime), 0, Math.round(performance.now() - startTime))
                    return response
                }
            }

            // Zenith Pages
            const pagePath = findPageForRoute(pathname, pagesDir)
            if (pagePath) {
                const compileStart = performance.now()
                let cached = pageCache.get(pagePath)
                const stat = fs.statSync(pagePath)

                if (!cached || stat.mtimeMs > cached.lastModified) {
                    cached = await compilePageInMemory(pagePath) || undefined
                    if (cached) pageCache.set(pagePath, cached)
                }
                const compileEnd = performance.now()

                if (cached) {
                    const renderStart = performance.now()
                    const html = await generateDevHTML(cached)
                    const renderEnd = performance.now()

                    const totalTime = Math.round(performance.now() - startTime)
                    const compileTime = Math.round(compileEnd - compileStart)
                    const renderTime = Math.round(renderEnd - renderStart)

                    logger.route('GET', pathname, 200, totalTime, compileTime, renderTime)
                    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
                }
            }

            logger.route('GET', pathname, 404, Math.round(performance.now() - startTime), 0, 0)
            return new Response('Not Found', { status: 404 })
        },
        websocket: {
            open(ws) {
                clients.add(ws)
            },
            close(ws) {
                clients.delete(ws)
            },
            message() { }
        }
    })

    process.on('SIGINT', () => {
        watcher.close()
        server.stop()
        process.exit(0)
    })

    await new Promise(() => { })
}

function findPageForRoute(route: string, pagesDir: string): string | null {
    // 1. Try exact match first (e.g., /about -> about.zen)
    const exactPath = path.join(pagesDir, route === '/' ? 'index.zen' : `${route.slice(1)}.zen`)
    if (fs.existsSync(exactPath)) return exactPath

    // 2. Try index.zen in directory (e.g., /about -> about/index.zen)
    const indexPath = path.join(pagesDir, route === '/' ? 'index.zen' : `${route.slice(1)}/index.zen`)
    if (fs.existsSync(indexPath)) return indexPath

    // 3. Try dynamic routes [slug].zen, [...slug].zen
    // Walk up the path looking for dynamic segments
    const segments = route === '/' ? [] : route.slice(1).split('/').filter(Boolean)

    // Try matching with dynamic [slug].zen at each level
    for (let i = segments.length - 1; i >= 0; i--) {
        const staticPart = segments.slice(0, i).join('/')
        const baseDir = staticPart ? path.join(pagesDir, staticPart) : pagesDir



        // Check for [slug].zen (single segment catch)
        const singleDynamicPath = path.join(baseDir, '[slug].zen')
        if (fs.existsSync(singleDynamicPath)) return singleDynamicPath

        // Check for [...slug].zen (catch-all)
        const catchAllPath = path.join(baseDir, '[...slug].zen')
        if (fs.existsSync(catchAllPath)) {

            return catchAllPath
        }
    }

    // 4. Check for catch-all at root
    const rootCatchAll = path.join(pagesDir, '[...slug].zen')
    if (fs.existsSync(rootCatchAll)) return rootCatchAll

    return null
}
