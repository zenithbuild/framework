import * as fs from 'fs'
import * as path from 'path'
import { parseZenFile } from '@zenithbuild/compiler'

export interface LayoutMetadata {
    name: string
    filePath: string
    props: string[]
    states: Map<string, any>
    html: string
    scripts: string[]
    styles: string[]
}

/**
 * Discover layouts in a directory using standard file system walking
 * and the unified native bridge for metadata.
 */
export function discoverLayouts(layoutsDir: string): Map<string, LayoutMetadata> {
    const layouts = new Map<string, LayoutMetadata>()

    if (!fs.existsSync(layoutsDir)) return layouts

    const files = fs.readdirSync(layoutsDir)
    for (const file of files) {
        if (file.endsWith('.zen')) {
            const fullPath = path.join(layoutsDir, file)
            const name = path.basename(file, '.zen')

            try {
                // Call the "One True Bridge" in metadata mode
                const ir = parseZenFile(fullPath, undefined, { mode: 'metadata' })

                layouts.set(name, {
                    name,
                    filePath: fullPath,
                    props: ir.props || [],
                    states: new Map(),
                    html: ir.template.raw,
                    scripts: ir.script ? [ir.script.content] : [],
                    styles: ir.styles?.map((s: any) => s.raw) || []
                })
            } catch (e) {
                console.error(`[Zenith Layout Discovery] Failed to parse layout ${file}:`, e)
            }
        }
    }

    return layouts
}
