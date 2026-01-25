/**
 * @zenithbuild/cli - Preview Command
 * 
 * Serves the production build from the distribution directory.
 */

import path from 'path'
import { serve } from 'bun'
import { requireProject } from '../utils/project'
import * as logger from '../utils/logger'

export interface PreviewOptions {
    port?: number
}

export async function preview(options: PreviewOptions = {}): Promise<void> {
    const project = requireProject()
    const distDir = project.distDir
    const port = options.port || parseInt(process.env.PORT || '4173', 10)

    logger.header('Zenith Preview Server')
    logger.log(`Serving: ${distDir}`)

    // File extensions that should be served as static assets
    const STATIC_EXTENSIONS = new Set([
        '.js', '.css', '.ico', '.png', '.jpg', '.jpeg', '.gif', '.svg',
        '.webp', '.woff', '.woff2', '.ttf', '.eot', '.json', '.map'
    ])

    const server = serve({
        port,
        async fetch(req) {
            const url = new URL(req.url)
            const pathname = url.pathname
            const ext = path.extname(pathname).toLowerCase()

            if (STATIC_EXTENSIONS.has(ext)) {
                const filePath = path.join(distDir, pathname)
                const file = Bun.file(filePath)
                if (await file.exists()) {
                    return new Response(file)
                }
                return new Response('Not found', { status: 404 })
            }

            const indexPath = path.join(distDir, 'index.html')
            const indexFile = Bun.file(indexPath)
            if (await indexFile.exists()) {
                return new Response(indexFile, {
                    headers: { 'Content-Type': 'text/html; charset=utf-8' }
                })
            }

            return new Response('No production build found. Run `zenith build` first.', { status: 500 })
        }
    })

    logger.success(`Preview server running at http://localhost:${server.port}`)
    logger.info('Press Ctrl+C to stop')

    await new Promise(() => { })
}
