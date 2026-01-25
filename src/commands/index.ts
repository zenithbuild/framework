/**
 * @zenithbuild/cli - Command Registry
 * 
 * Central registry for all CLI commands
 */

import { dev, type DevOptions } from './dev'
import { preview, type PreviewOptions } from './preview'
import { build, type BuildOptions } from './build'
import { add, type AddOptions } from './add'
import { remove } from './remove'
import { create } from './create'
import * as logger from '../utils/logger'

export interface Command {
    name: string
    description: string
    usage: string
    run: (args: string[], options: Record<string, string>) => Promise<void>
}

export const commands: Command[] = [
    {
        name: 'create',
        description: 'Create a new Zenith project',
        usage: 'zenith create [project-name]',
        async run(args) {
            const projectName = args[0]
            await create(projectName)
        }
    },
    {
        name: 'dev',
        description: 'Start development server',
        usage: 'zenith dev [--port <port>]',
        async run(args, options) {
            const opts: DevOptions = {}
            if (options.port) opts.port = parseInt(options.port, 10)
            await dev(opts)
        }
    },
    {
        name: 'preview',
        description: 'Preview production build',
        usage: 'zenith preview [--port <port>]',
        async run(args, options) {
            const opts: PreviewOptions = {}
            if (options.port) opts.port = parseInt(options.port, 10)
            await preview(opts)
        }
    },
    {
        name: 'build',
        description: 'Build for production',
        usage: 'zenith build [--outDir <dir>]',
        async run(args, options) {
            const opts: BuildOptions = {}
            if (options.outDir) opts.outDir = options.outDir
            await build(opts)
        }
    },
    {
        name: 'add',
        description: 'Add a plugin',
        usage: 'zenith add <plugin>',
        async run(args) {
            const pluginName = args[0]
            if (!pluginName) {
                logger.error('Plugin name required')
                process.exit(1)
            }
            await add(pluginName)
        }
    },
    {
        name: 'remove',
        description: 'Remove a plugin',
        usage: 'zenith remove <plugin>',
        async run(args) {
            const pluginName = args[0]
            if (!pluginName) {
                logger.error('Plugin name required')
                process.exit(1)
            }
            await remove(pluginName)
        }
    }
]

// Placeholder commands for future expansion
export const placeholderCommands = ['test', 'export', 'deploy']

export function getCommand(name: string): Command | undefined {
    return commands.find(c => c.name === name)
}

export function showHelp(): void {
    logger.header('Zenith CLI')
    console.log('Usage: zenith <command> [options]\n')
    console.log('Commands:')

    for (const cmd of commands) {
        console.log(`  ${cmd.name.padEnd(12)} ${cmd.description}`)
    }

    console.log('\nComing soon:')
    for (const cmd of placeholderCommands) {
        console.log(`  ${cmd.padEnd(12)} (not yet implemented)`)
    }

    console.log('\nRun `zenith <command> --help` for command-specific help.')
}
