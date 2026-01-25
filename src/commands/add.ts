/**
 * @zenithbuild/cli - Add Command
 * 
 * Registers a plugin in the project
 */

import { requireProject } from '../utils/project'
import { addPlugin, hasPlugin } from '../utils/plugin-manager'
import * as logger from '../utils/logger'

export interface AddOptions {
    options?: Record<string, unknown>
}

export async function add(pluginName: string, options: AddOptions = {}): Promise<void> {
    requireProject()

    logger.header('Add Plugin')

    if (!pluginName) {
        logger.error('Plugin name required. Usage: zenith add <plugin>')
        process.exit(1)
    }

    if (hasPlugin(pluginName)) {
        logger.warn(`Plugin "${pluginName}" is already registered`)
        return
    }

    const success = addPlugin(pluginName, options.options)

    if (success) {
        logger.info(`Plugin "${pluginName}" has been registered.`)
        logger.info('Note: You may need to install the package manually:')
        logger.log(`  bun add @zenithbuild/plugin-${pluginName}`)
    }
}
