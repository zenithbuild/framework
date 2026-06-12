import type { CommandContext } from '../shared/context.js';
import { runPluginInfo } from './info.js';
import { runPluginList } from './list.js';
import { runPluginSearch } from './search.js';

function printPluginHelp(ctx: CommandContext): void {
    ctx.logger.print('Usage:');
    ctx.logger.print('  zenith plugin list');
    ctx.logger.print('  zenith plugin search <term>');
    ctx.logger.print('  zenith plugin info <name|alias>');
}

export async function runCommand(args: string[], ctx: CommandContext): Promise<number> {
    const subcommand = args[0];
    const rest = args.slice(1);

    if (!subcommand || subcommand === '--help' || subcommand === '-h') {
        printPluginHelp(ctx);
        return 0;
    }

    switch (subcommand) {
        case 'list':
            return runPluginList(ctx);
        case 'search':
            return runPluginSearch(ctx, rest[0] ?? '');
        case 'info':
            return runPluginInfo(ctx, rest[0] ?? '');
        default:
            ctx.logger.print(`Unknown plugin command: ${subcommand}`);
            printPluginHelp(ctx);
            return 1;
    }
}
