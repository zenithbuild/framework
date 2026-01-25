/**
 * @zenithbuild/cli - Plugin Manager
 * 
 * Manages zenith.plugins.json for plugin registration
 */

import fs from 'fs'
import path from 'path'
import { findProjectRoot } from './project'
import * as logger from './logger'

export interface PluginConfig {
    name: string
    installedAt: string
    options?: Record<string, unknown>
}

export interface PluginsFile {
    plugins: PluginConfig[]
}

const PLUGINS_FILE = 'zenith.plugins.json'

/**
 * Get path to plugins file
 */
function getPluginsPath(): string {
    const root = findProjectRoot()
    if (!root) {
        throw new Error('Not in a Zenith project')
    }
    return path.join(root, PLUGINS_FILE)
}

/**
 * Read plugins file
 */
export function readPlugins(): PluginsFile {
    const pluginsPath = getPluginsPath()

    if (!fs.existsSync(pluginsPath)) {
        return { plugins: [] }
    }

    try {
        return JSON.parse(fs.readFileSync(pluginsPath, 'utf-8'))
    } catch {
        return { plugins: [] }
    }
}

/**
 * Write plugins file
 */
function writePlugins(data: PluginsFile): void {
    const pluginsPath = getPluginsPath()
    fs.writeFileSync(pluginsPath, JSON.stringify(data, null, 2))
}

/**
 * Add a plugin to the registry
 */
export function addPlugin(name: string, options?: Record<string, unknown>): boolean {
    const data = readPlugins()

    // Check if already installed
    if (data.plugins.some(p => p.name === name)) {
        logger.warn(`Plugin "${name}" is already registered`)
        return false
    }

    data.plugins.push({
        name,
        installedAt: new Date().toISOString(),
        options
    })

    writePlugins(data)
    logger.success(`Added plugin "${name}"`)
    return true
}

/**
 * Remove a plugin from the registry
 */
export function removePlugin(name: string): boolean {
    const data = readPlugins()
    const initialLength = data.plugins.length

    data.plugins = data.plugins.filter(p => p.name !== name)

    if (data.plugins.length === initialLength) {
        logger.warn(`Plugin "${name}" is not registered`)
        return false
    }

    writePlugins(data)
    logger.success(`Removed plugin "${name}"`)
    return true
}

/**
 * List all registered plugins
 */
export function listPlugins(): PluginConfig[] {
    return readPlugins().plugins
}

/**
 * Check if a plugin is registered
 */
export function hasPlugin(name: string): boolean {
    return readPlugins().plugins.some(p => p.name === name)
}
