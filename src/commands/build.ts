/**
 * @zenithbuild/cli - Build Command
 * 
 * Builds the application for production using SSG.
 */

import { requireProject } from '../utils/project'
import * as logger from '../utils/logger'
import { buildSSG } from '@zenithbuild/compiler'

export interface BuildOptions {
    outDir?: string
}

export async function build(options: BuildOptions = {}): Promise<void> {
    const project = requireProject()
    const outDir = options.outDir || project.distDir

    logger.header('Zenith Build')
    logger.log(`Source: ${project.pagesDir}`)
    logger.log(`Output: ${outDir}`)

    try {
        buildSSG({
            pagesDir: project.pagesDir,
            outDir: outDir,
            baseDir: project.root
        })
        logger.success('Build complete!')

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error(`Build failed: ${message}`)
        process.exit(1)
    }
}
