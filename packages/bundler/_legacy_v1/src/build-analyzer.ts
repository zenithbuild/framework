/**
 * Zenith Build Analyzer
 * 
 * Analyzes .zen page source to determine build strategy:
 * - Static: Pure HTML+CSS, no JS needed
 * - Hydration: Has state/events/hooks, needs page-specific JS
 * - SSR: Uses useFetchServer, needs server rendering
 * - SPA: Uses ZenLink with passHref, needs client router
 */

export interface PageAnalysis {
    /** Page has state declarations that need hydration */
    hasState: boolean
    /** Page has event handlers (onclick, etc.) */
    hasEventHandlers: boolean
    /** Page uses lifecycle hooks (zenOnMount, zenOnUnmount) */
    hasLifecycleHooks: boolean
    /** Page uses useFetchServer (requires SSR) */
    usesServerFetch: boolean
    /** Page uses useFetchClient (client-side data) */
    usesClientFetch: boolean
    /** Page uses ZenLink with passHref (SPA navigation) */
    usesZenLink: boolean
    /** Page uses reactive expressions in templates */
    hasReactiveExpressions: boolean

    /** Computed: page needs any JavaScript */
    needsHydration: boolean
    /** Computed: page is purely static (no JS) */
    isStatic: boolean
    /** Computed: page needs SSR */
    needsSSR: boolean
}

/**
 * Analyze a .zen page source to determine build requirements
 */
export function analyzePageSource(source: string): PageAnalysis {
    // Extract script content for analysis
    const scriptMatch = source.match(/<script[^>]*>([\s\S]*?)<\/script>/i)
    const scriptContent = scriptMatch?.[1] || ''

    // Extract template content (everything outside script/style)
    const templateContent = source
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')

    // Check for state declarations: "state varName = ..."
    const hasState = /\bstate\s+\w+\s*=/.test(scriptContent)

    // Check for event handlers in template
    const hasEventHandlers = /\bon(click|change|input|submit|focus|blur|keydown|keyup|keypress|mousedown|mouseup|mouseover|mouseout|mouseenter|mouseleave|load)\s*=\s*["'{]/.test(templateContent)

    // Check for lifecycle hooks
    const hasLifecycleHooks = /\bzen(OnMount|OnUnmount)\s*\(/.test(scriptContent)

    // Check for server fetch
    const usesServerFetch = /\buseFetchServer\s*\(/.test(scriptContent)

    // Check for client fetch
    const usesClientFetch = /\buseFetchClient\s*\(/.test(scriptContent)

    // Check for ZenLink with passHref
    const usesZenLink = /<ZenLink[^>]*passHref[^>]*>/.test(templateContent)

    // Check for reactive expressions in template: {expression}
    // Must be actual expressions, not just static text
    // Exclude attribute values like href="/path"
    const hasReactiveExpressions = /{[^{}]+}/.test(templateContent)

    // Compute derived properties
    const needsHydration = hasState || hasEventHandlers || hasLifecycleHooks ||
        usesClientFetch || hasReactiveExpressions
    const isStatic = !needsHydration && !usesServerFetch
    const needsSSR = usesServerFetch

    return {
        hasState,
        hasEventHandlers,
        hasLifecycleHooks,
        usesServerFetch,
        usesClientFetch,
        usesZenLink,
        hasReactiveExpressions,
        needsHydration,
        isStatic,
        needsSSR
    }
}

/**
 * Get a human-readable summary of the page analysis
 */
export function getAnalysisSummary(analysis: PageAnalysis): string {
    const flags: string[] = []

    if (analysis.isStatic) {
        flags.push('STATIC (no JS)')
    } else {
        if (analysis.hasState) flags.push('state')
        if (analysis.hasEventHandlers) flags.push('events')
        if (analysis.hasLifecycleHooks) flags.push('lifecycle')
        if (analysis.hasReactiveExpressions) flags.push('reactive')
        if (analysis.usesClientFetch) flags.push('clientFetch')
    }

    if (analysis.needsSSR) flags.push('SSR')
    if (analysis.usesZenLink) flags.push('SPA')

    return flags.length > 0 ? flags.join(', ') : 'minimal'
}

/**
 * Determine build output type for a page
 */
export type BuildOutputType = 'static' | 'hydrated' | 'ssr'

export function getBuildOutputType(analysis: PageAnalysis): BuildOutputType {
    if (analysis.needsSSR) return 'ssr'
    if (analysis.needsHydration) return 'hydrated'
    return 'static'
}
