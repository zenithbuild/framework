/**
 * @zenithbuild/cli - Lint Command
 * 
 * Scans for .zen files and enforces the Zenith Contract.
 */

import { glob } from 'glob'
import { join } from 'path'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { compile } from '../../../zenith-compiler/dist/index.js'
import * as logger from '../utils/logger'
import picocolors from 'picocolors'
import { createHash } from 'crypto'
import { dirname } from 'path'

export interface LintOptions {
    fix?: boolean
    incremental?: boolean
}

interface LintCache {
    files: Record<string, string> // path -> hash
}

function findProjectRoot(startDir: string): string {
    let current = startDir
    while (current !== dirname(current)) {
        if (existsSync(join(current, 'package.json')) || existsSync(join(current, '.zenith'))) {
            return current
        }
        current = dirname(current)
    }
    return startDir
}

export async function lint(fileArgs: string[] = [], options: LintOptions = {}): Promise<void> {
    logger.header('Zenith Safety Audit')

    const isIncremental = options.incremental || false

    // Find files
    // Filter out flags that might have been passed in args
    const filesToScan = fileArgs.filter(a => !a.startsWith('--'))
    let files: string[] = []

    if (filesToScan.length > 0) {
        files = filesToScan
    } else {
        files = await glob('**/*.zen', {
            ignore: ['**/node_modules/**', '**/dist/**', '.git/**', '**/test/**']
        })
    }

    if (files.length === 0) {
        logger.info('No .zen files found to audit.')
        return
    }

    // Load lint cache - Optimized for monorepos
    const root = findProjectRoot(process.cwd())
    const cacheDir = join(root, '.zenith/cache')
    const cachePath = join(cacheDir, 'lint-cache.json')
    let lintCache: LintCache = { files: {} }

    if (isIncremental && existsSync(cachePath)) {
        try {
            lintCache = JSON.parse(readFileSync(cachePath, 'utf-8'))
        } catch (e) {
            logger.warn('Failed to load lint cache, starting fresh.')
        }
    }

    logger.info(`Auditing ${files.length} components${isIncremental ? ' (incremental)' : ''}...\n`)

    let errorCount = 0
    let fileCount = 0
    let skippedCount = 0
    const newCache: LintCache = { files: { ...lintCache.files } }

    for (const file of files) {
        fileCount++
        const source = readFileSync(file, 'utf-8')
        const hash = createHash('sha256').update(source).digest('hex')

        if (isIncremental && lintCache.files[file] === hash) {
            skippedCount++
            continue
        }

        try {
            // Run compilation with cache enabled for components
            process.env.ZENITH_CACHE = '1'
            await compile(source, file)
            newCache.files[file] = hash
        } catch (error: any) {
            errorCount++
            // Clear cache for this file on error
            delete newCache.files[file]

            if (error.name === 'InvariantError' || error.name === 'CompilerError') {
                console.log(picocolors.red(picocolors.bold(`\n✖ ${file}:${error.line}:${error.column}`)))
                console.log(picocolors.red(`  [${error.code || 'ERROR'}] ${error.message}`))

                if (error.guarantee) {
                    console.log(picocolors.yellow(`  Guarantee: ${error.guarantee}`))
                }

                if (error.context) {
                    console.log(picocolors.dim(`  Context: ${error.context}`))
                }

                if (error.hints && error.hints.length > 0) {
                    console.log(picocolors.cyan('  Hints:'))
                    for (const hint of error.hints) {
                        console.log(picocolors.cyan(`    - ${hint}`))
                    }
                }
            } else {
                console.log(picocolors.red(`\n✖ ${file}: Unexpected error`))
                console.log(picocolors.red(`  ${error.message}`))
            }
        }
    }

    // Save updated cache
    if (isIncremental) {
        if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true })
        writeFileSync(cachePath, JSON.stringify(newCache, null, 2))
    }

    console.log('')

    if (errorCount > 0) {
        logger.error(`Audit failed. Found ${errorCount} contract violations in ${fileCount} files.`)
        process.exit(1)
    } else {
        const skipMsg = skippedCount > 0 ? ` (${skippedCount} unchanged files skipped)` : ''
        logger.success(`Audit passed. ${fileCount} files checked${skipMsg}, 0 violations found.`)
    }
}
