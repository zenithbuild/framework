/**
 * @zenithbuild/cli - Remove Command
 * 
 * Removes a plugin from the project registry
 */

import { requireProject } from '../utils/project'
import { removePlugin, hasPlugin } from '../utils/plugin-manager'
import * as logger from '../utils/logger'

export async function remove(pluginName: string): Promise<void> {
    requireProject()

    logger.header('Remove Plugin')

    if (!pluginName) {
        logger.error('Plugin name required. Usage: zenith remove <plugin>')
        process.exit(1)
    }

    if (!hasPlugin(pluginName)) {
        logger.warn(`Plugin "${pluginName}" is not registered`)
        return
    }

    const success = removePlugin(pluginName)

    if (success) {
        logger.info(`Plugin "${pluginName}" has been unregistered.`)
        logger.info('Note: You may want to remove the package manually:')
        logger.log(`  bun remove @zenithbuild/plugin-${pluginName}`)
    }
}
