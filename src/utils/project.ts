/**
 * @zenithbuild/cli - Project Utility
 * 
 * Detects Zenith project root and configuration
 */

import fs from 'fs'
import path from 'path'

export interface ZenithProject {
    root: string
    pagesDir: string
    distDir: string
    hasZenithDeps: boolean
}

/**
 * Find the project root by looking for package.json with @zenith dependencies
 */
export function findProjectRoot(startDir: string = process.cwd()): string | null {
    let current = startDir

    while (current !== path.dirname(current)) {
        const pkgPath = path.join(current, 'package.json')

        if (fs.existsSync(pkgPath)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
                const deps = { ...pkg.dependencies, ...pkg.devDependencies }

                // Check for any @zenithbuild/* or @zenithbuild/* dependency
                const hasZenith = Object.keys(deps).some(d => d.startsWith('@zenithbuild/') || d.startsWith('@zenithbuild/'))
                if (hasZenith) {
                    return current
                }
            } catch {
                // Invalid JSON, skip
            }
        }

        current = path.dirname(current)
    }

    return null
}

/**
 * Get project configuration
 */
export function getProject(cwd: string = process.cwd()): ZenithProject | null {
    const root = findProjectRoot(cwd)
    if (!root) return null

    // Support both app/ and src/ directory structures
    let appDir = path.join(root, 'app')
    if (!fs.existsSync(appDir)) {
        appDir = path.join(root, 'src')
    }

    return {
        root,
        pagesDir: path.join(appDir, 'pages'),
        distDir: path.join(appDir, 'dist'),
        hasZenithDeps: true
    }
}

/**
 * Ensure we're in a Zenith project
 */
export function requireProject(cwd: string = process.cwd()): ZenithProject {
    const project = getProject(cwd)
    if (!project) {
        throw new Error('Not in a Zenith project. Run this command from a directory with @zenithbuild/* dependencies.')
    }
    return project
}
