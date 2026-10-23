import type { CommandContext } from '../shared/context.js';
import { runAdapterList } from './list.js';

function printAdapterHelp(ctx: CommandContext): void {
    ctx.logger.print('Usage:');
    ctx.logger.print('  zenith adapter list');
}

export async function runCommand(args: string[], ctx: CommandContext): Promise<number> {
    const subcommand = args[0];

    if (!subcommand || subcommand === '--help' || subcommand === '-h') {
        printAdapterHelp(ctx);
        return 0;
    }

    if (subcommand === 'list') {
        return runAdapterList(ctx);
    }

    ctx.logger.print(`Unknown adapter command: ${subcommand}`);
    printAdapterHelp(ctx);
    return 1;
}
