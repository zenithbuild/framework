/**
 * Zenith CSS Compiler Module
 * 
 * Compiler-owned CSS processing that integrates Tailwind CSS v4 JIT
 * at compile time. This module ensures:
 * 
 * 1. All CSS is processed at build time (no runtime generation)
 * 2. Tailwind sees all .zen templates for class scanning
 * 3. HMR support for instant CSS updates in dev mode
 * 4. Deterministic, cacheable output for production
 * 
 * Per Zenith CSS Directive: The compiler owns styles.
 */

import { spawn, spawnSync } from 'child_process'
import path from 'path'
import fs from 'fs'

// ============================================
// Types
// ============================================

export interface CSSCompileOptions {
    /** Input CSS file path (e.g., src/styles/globals.css) */
    input: string
    /** Output CSS file path, or ':memory:' for in-memory result */
    output: string
    /** Enable minification for production */
    minify?: boolean
    /** Watch mode for HMR */
    watch?: boolean
}

export interface CSSCompileResult {
    /** Compiled CSS content */
    css: string
    /** Compilation time in milliseconds */
    duration: number
    /** Whether compilation succeeded */
    success: boolean
    /** Error message if failed */
    error?: string
}

// ============================================
// CSS Compilation
// ============================================

/**
 * Compile CSS using Tailwind CSS v4 CLI
 */
export function compileCss(options: CSSCompileOptions): CSSCompileResult {
    const startTime = performance.now()
    const { input, output, minify = false } = options

    // Validate input exists
    if (!fs.existsSync(input)) {
        return {
            css: '',
            duration: 0,
            success: false,
            error: `CSS input file not found: ${input}`
        }
    }

    try {
        // Build Tailwind CLI arguments
        const args = [
            '@tailwindcss/cli',
            '-i', input
        ]

        // For in-memory compilation, use stdout
        const useStdout = output === ':memory:'
        if (!useStdout) {
            args.push('-o', output)
        }

        if (minify) {
            args.push('--minify')
        }

        // Execute Tailwind CLI synchronously
        const result = spawnSync('bunx', args, {
            cwd: path.dirname(input),
            encoding: 'utf-8',
            stdio: useStdout ? ['pipe', 'pipe', 'pipe'] : ['pipe', 'inherit', 'pipe'],
            env: { ...process.env }
        })

        const duration = Math.round(performance.now() - startTime)

        if (result.status !== 0) {
            const errorMsg = result.stderr?.toString() || 'Unknown compilation error'
            return {
                css: '',
                duration,
                success: false,
                error: `Tailwind compilation failed: ${errorMsg}`
            }
        }

        // Get CSS content
        let css = ''
        if (useStdout) {
            css = result.stdout?.toString() || ''
        } else if (fs.existsSync(output)) {
            css = fs.readFileSync(output, 'utf-8')
        }

        return {
            css,
            duration,
            success: true
        }

    } catch (error: any) {
        return {
            css: '',
            duration: Math.round(performance.now() - startTime),
            success: false,
            error: error.message
        }
    }
}

/**
 * Compile CSS asynchronously (non-blocking)
 */
export async function compileCssAsync(options: CSSCompileOptions): Promise<CSSCompileResult> {
    return new Promise((resolve) => {
        const startTime = performance.now()
        const { input, output, minify = false } = options

        if (!fs.existsSync(input)) {
            resolve({
                css: '',
                duration: 0,
                success: false,
                error: `CSS input file not found: ${input}`
            })
            return
        }

        const args = ['@tailwindcss/cli', '-i', input]
        const useStdout = output === ':memory:'

        if (!useStdout) {
            args.push('-o', output)
        }

        if (minify) {
            args.push('--minify')
        }

        const child = spawn('bunx', args, {
            cwd: path.dirname(input),
            stdio: useStdout ? ['pipe', 'pipe', 'pipe'] : ['pipe', 'inherit', 'pipe'],
            env: { ...process.env }
        })

        let stdout = ''
        let stderr = ''

        if (useStdout && child.stdout) {
            child.stdout.on('data', (data) => { stdout += data.toString() })
        }

        if (child.stderr) {
            child.stderr.on('data', (data) => { stderr += data.toString() })
        }

        child.on('close', (code) => {
            const duration = Math.round(performance.now() - startTime)

            if (code !== 0) {
                resolve({
                    css: '',
                    duration,
                    success: false,
                    error: `Tailwind compilation failed: ${stderr}`
                })
                return
            }

            let css = ''
            if (useStdout) {
                css = stdout
            } else if (fs.existsSync(output)) {
                css = fs.readFileSync(output, 'utf-8')
            }

            resolve({
                css,
                duration,
                success: true
            })
        })

        child.on('error', (err) => {
            resolve({
                css: '',
                duration: Math.round(performance.now() - startTime),
                success: false,
                error: err.message
            })
        })
    })
}

export interface CSSWatchOptions extends CSSCompileOptions {
    /** Callback when CSS changes */
    onChange: (result: CSSCompileResult) => void
    /** Debounce delay in ms */
    debounce?: number
}

/**
 * Watch CSS and source files for changes, recompile on change
 */
export function watchCss(options: CSSWatchOptions): () => void {
    const { input, output, minify, onChange, debounce = 100 } = options

    let timeout: NodeJS.Timeout | null = null
    let isCompiling = false

    const recompile = async () => {
        if (isCompiling) return
        isCompiling = true

        const result = await compileCssAsync({ input, output, minify })
        onChange(result)

        isCompiling = false
    }

    const debouncedRecompile = () => {
        if (timeout) clearTimeout(timeout)
        timeout = setTimeout(recompile, debounce)
    }

    // Watch the styles directory
    const stylesDir = path.dirname(input)
    const stylesWatcher = fs.watch(stylesDir, { recursive: true }, (event, filename) => {
        if (filename?.endsWith('.css')) {
            debouncedRecompile()
        }
    })

    // Watch source files that Tailwind scans (for class changes)
    const srcDir = path.resolve(stylesDir, '..')
    let srcWatcher: fs.FSWatcher | null = null

    if (fs.existsSync(srcDir)) {
        srcWatcher = fs.watch(srcDir, { recursive: true }, (event, filename) => {
            if (filename?.endsWith('.zen') || filename?.endsWith('.tsx') || filename?.endsWith('.jsx')) {
                debouncedRecompile()
            }
        })
    }

    // Return cleanup function
    return () => {
        if (timeout) clearTimeout(timeout)
        stylesWatcher.close()
        srcWatcher?.close()
    }
}

/**
 * Resolve the canonical globals.css path for a Zenith project
 */
export function resolveGlobalsCss(projectRoot: string): string | null {
    // Check for globals.css (canonical)
    const globalsPath = path.join(projectRoot, 'src', 'styles', 'globals.css')
    if (fs.existsSync(globalsPath)) return globalsPath

    // Check for global.css (legacy)
    const globalPath = path.join(projectRoot, 'src', 'styles', 'global.css')
    if (fs.existsSync(globalPath)) return globalPath

    return null
}

/**
 * Get the output path for compiled CSS
 */
export function getCompiledCssPath(projectRoot: string, mode: 'dev' | 'build'): string {
    if (mode === 'build') {
        return path.join(projectRoot, 'dist', 'assets', 'styles.css')
    }
    // In dev mode, we use in-memory compilation
    return ':memory:'
}
