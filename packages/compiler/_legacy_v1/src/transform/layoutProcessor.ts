/**
 * Layout Processor - wraps page content with layout HTML
 *
 * This module provides TypeScript-based layout processing by replacing
 * the default slot in a layout with the page content.
 */

export interface LayoutDefinition {
    name: string
    filePath: string
    html: string
    props?: string[]
    styles?: string[]
    scripts?: string[]
}

/**
 * Process layout wrapping for a Zenith source file.
 * 
 * Takes page source content and wraps it with the layout HTML,
 * replacing the <slot /> placeholder with the page content.
 *
 * @param source - The source content of the page
 * @param layout - The layout definition
 * @param _props - Optional props (reserved for future use)
 * @returns Processed source with layout applied
 */
export function processLayout(
    source: string,
    layout: LayoutDefinition | string,
    _props?: Record<string, any>
): string {
    // If layout is a string path, return source unchanged (caller should resolve)
    if (typeof layout === 'string') {
        return source
    }

    // Extract template portion from page source (content between close of <script> and open of <style> or end)
    // For now, pass through - the native compiler handles layout via parseFullZenNative options
    const layoutHtml = layout.html

    // Replace default slot with page content
    // THe slot syntax in Zenith is <slot /> or <slot></slot>
    // Robust regex to handle attributes, self-closing, and closing tags
    const slotPattern = /<slot[\s\S]*?(?:<\/slot>|\/>)/gi

    if (slotPattern.test(layoutHtml)) {
        return layoutHtml.replace(slotPattern, source)
    }

    // If no slot found, append page content
    return layoutHtml + '\n' + source
}
