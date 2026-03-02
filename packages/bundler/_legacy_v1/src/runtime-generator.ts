import type { ZenManifest } from './types'

export function generateRuntime(manifest: ZenManifest, isDev: boolean = false): { code: string } {
    // In dev mode, content is already SSR'd into #app, so we skip router initialization
    // which would otherwise try to re-render and fail due to missing module/load
    if (isDev) {
        return {
            code: `
// Dev mode: Content already SSR'd, skip router initialization
// Router navigation will be available but initial render is from server

// Expose router utilities for navigation
import { navigate, getRoute, onRouteChange } from '@zenithbuild/router'

if (window.zenith) {
    window.zenith.router = { navigate, getRoute, onRouteChange }
}
`
        }
    }

    // Production mode: Full router initialization
    // Serialize routes with special handling for RegExp objects and Scripts
    const serializedRoutes = manifest.routes.map(route => {
        // Prepare route object for serialization
        const safeRoute = { ...route };

        // Convert RegExp to serializable format
        if (safeRoute.regex) {
            safeRoute.regex = { source: route.regex.source, flags: route.regex.flags };
        }

        // CRITICAL: We do NOT serialize the raw script string to JSON because we want to inject it as code
        // We will inject it separately in the map below
        delete safeRoute.script;

        return safeRoute;
    })

    const routesJson = JSON.stringify(serializedRoutes)

    return {
        code: `
import { initRouter, navigate, getRoute } from '@zenithbuild/router'

// Reconstruct routes with RegExp objects and injected scripts
const routesRaw = ${routesJson}
const routes = routesRaw.map((r, i) => ({
    ...r,
    regex: r.regex ? new RegExp(r.regex.source, r.regex.flags) : null,
    // Inject component script if available (matched by index from manifest)
    setup: function() {
        ${manifest.routes.map((r, i) => `if (i === ${i}) {
            ${r.script ? r.script : ''}
        }`).join(' else ')}
    }
}))

// Initialize Router
initRouter(routes, '#app')

// Initialize Runtime
if (window.zenith) {
    window.zenith.router = { navigate, getRoute }
}
`
    }
}
