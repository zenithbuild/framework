/**
 * @zenithbuild/cli - Shared CLI Execution Logic
 */

import process from 'node:process'
import { getCommand, showHelp, placeholderCommands } from './commands/index'
import * as logger from './utils/logger'
import { execSync } from 'node:child_process'

/**
 * Check if Bun is available in the environment
 */
function checkBun() {
    try {
        execSync('bun --version', { stdio: 'pipe' })
        return true
    } catch {
        return false
    }
}

export interface CLIOptions {
    defaultCommand?: string
}

/**
 * Main CLI execution entry point
 */
export async function runCLI(options: CLIOptions = {}) {
    // 1. Check for Bun
    if (!checkBun()) {
        logger.error('Bun is required to run Zenith.')
        logger.info('Please install Bun: https://bun.sh/install')
        process.exit(1)
    }

    const args = process.argv.slice(2)
    const VERSION = '0.3.0'

    // 2. Handle global version flag
    if (args.includes('--version') || args.includes('-v')) {
        console.log(`Zenith CLI v${VERSION}`)
        process.exit(0)
    }

    // Determine command name: either from args or default (for aliases)
    let commandName = args[0]
    let commandArgs = args.slice(1)

    if (options.defaultCommand) {
        if (!commandName || commandName.startsWith('-')) {
            commandName = options.defaultCommand
            commandArgs = args
        }
    }

    // Handle help
    if (!commandName || ((commandName === '--help' || commandName === '-h') && !options.defaultCommand)) {
        showHelp()
        process.exit(0)
    }

    // Parse options (--key value format) for internal use if needed
    const cliOptions: Record<string, string> = {}
    for (let i = 0; i < commandArgs.length; i++) {
        const arg = commandArgs[i]!
        if (arg.startsWith('--')) {
            const key = arg.slice(2)
            const value = commandArgs[i + 1]
            if (value && !value.startsWith('--')) {
                cliOptions[key] = value
                i++
            } else {
                cliOptions[key] = 'true'
            }
        }
    }

    // Check for placeholder commands
    if (placeholderCommands.includes(commandName)) {
        logger.warn(`Command "${commandName}" is not yet implemented.`)
        logger.info('This feature is planned for a future release.')
        process.exit(0)
    }

    const command = getCommand(commandName)

    if (!command) {
        logger.error(`Unknown command: ${commandName}`)
        showHelp()
        process.exit(1)
    }

    try {
        await command!.run(commandArgs, cliOptions)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error(message)
        process.exit(1)
    }
}
