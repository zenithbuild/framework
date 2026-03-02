/**
 * Generate Final Bundle
 * 
 * Phase 8/9/10: Generate final browser-ready bundle
 * 
 * Combines:
 * - Compiled HTML
 * - Runtime JS
 * - Expression functions
 * - Event bindings
 * - Style injection
 */

import type { FinalizedOutput } from '@zenithbuild/compiler'

/**
 * Generate final bundle code
 * 
 * This is the complete JavaScript bundle that will execute in the browser.
 * All expressions are pre-compiled - no template parsing at runtime.
 */
export function generateFinalBundle(finalized: FinalizedOutput): string {
    return `// Zenith Compiled Bundle (Phase 8/9/10)
// Generated at compile time - no .zen parsing in browser
// All expressions are pre-compiled - deterministic output

${finalized.js}

// Bundle complete - ready for browser execution
`
}

/**
 * Generate HTML with inline script
 */
export function generateHTMLWithScript(
    html: string,
    jsBundle: string,
    styles: string[]
): string {
    // Inject styles as <style> tags
    const styleTags = styles.map(style => `<style>${escapeHTML(style)}</style>`).join('\n')

    // Inject JS bundle as inline script
    const scriptTag = `<script>${jsBundle}</script>`

    // Find </head> or <body> to inject styles
    // Find </body> to inject script
    let result = html

    if (styleTags) {
        if (result.includes('</head>')) {
            result = result.replace('</head>', `${styleTags}\n</head>`)
        } else if (result.includes('<body')) {
            result = result.replace('<body', `${styleTags}\n<body`)
        }
    }

    if (scriptTag) {
        if (result.includes('</body>')) {
            result = result.replace('</body>', `${scriptTag}\n</body>`)
        } else {
            result += scriptTag
        }
    }

    return result
}

/**
 * Escape HTML for safe embedding
 */
function escapeHTML(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
}
