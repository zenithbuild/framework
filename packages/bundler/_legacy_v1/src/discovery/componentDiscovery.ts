/**
 * Component Discovery
 * 
 * Discovers and catalogs components in a Zenith project using standard 
 * file system walking and the unified native "syscall" for metadata.
 */

import * as fs from 'fs'
import * as path from 'path'
import { parseZenFile, type TemplateNode, type ExpressionIR } from '@zenithbuild/compiler'

export interface SlotDefinition {
    name: string | null  // null = default slot, string = named slot
    location: {
        line: number
        column: number
    }
}

export interface ComponentMetadata {
    name: string          // Component name (e.g., "Card", "Button")
    path: string          // Absolute path to .zen file
    template: string      // Raw template HTML
    nodes: TemplateNode[] // Parsed template nodes
    expressions: ExpressionIR[] // Component-level expressions
    slots: SlotDefinition[]
    props: string[]       // Declared props
    states: Record<string, string> // Declared state (name -> initializer)
    styles: string[]      // Raw CSS from <style> blocks
    script: string | null         // Raw script content for bundling
    scriptAttributes: Record<string, string> | null  // Script attributes (setup, lang)
    hasScript: boolean
    hasStyles: boolean
}

/**
 * Discover all components in a directory recursively
 */
export function discoverComponents(baseDir: string): Map<string, ComponentMetadata> {
    const components = new Map<string, ComponentMetadata>()

    if (!fs.existsSync(baseDir)) return components;

    const walk = (dir: string) => {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            if (fs.statSync(fullPath).isDirectory()) {
                walk(fullPath);
            } else if (file.endsWith('.zen')) {
                const name = path.basename(file, '.zen');
                try {
                    // Call the "One True Bridge" in metadata mode
                    const ir = parseZenFile(fullPath, undefined, { mode: 'metadata' });

                    // Map IR to ComponentMetadata format
                    components.set(name, {
                        name,
                        path: fullPath,
                        template: ir.template.raw,
                        nodes: ir.template.nodes,
                        expressions: ir.template.expressions,
                        slots: [], // Native bridge needs to return slot info in IR if used
                        props: ir.props || [],
                        states: ir.script?.states || {},
                        styles: ir.styles?.map((s: any) => s.raw) || [],
                        script: ir.script?.raw || null,
                        scriptAttributes: ir.script?.attributes || null,
                        hasScript: !!ir.script,
                        hasStyles: ir.styles?.length > 0
                    });
                } catch (e) {
                    console.error(`[Zenith Discovery] Failed to parse component ${file}:`, e);
                }
            }
        }
    };

    walk(baseDir);
    return components;
}

/**
 * Universal Zenith Component Tag Rule: PascalCase
 */
export function isComponentTag(tagName: string): boolean {
    return tagName.length > 0 && tagName[0] === tagName[0]?.toUpperCase()
}

/**
 * Get component metadata by name
 */
export function getComponent(
    components: Map<string, ComponentMetadata>,
    name: string
): ComponentMetadata | undefined {
    return components.get(name)
}
