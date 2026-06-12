import { listExtensions } from '@zenithbuild/extension-registry';
import type { CommandContext } from '../shared/context.js';

export function runPluginList(ctx: CommandContext): number {
    const entries = listExtensions('plugin');
    if (entries.length === 0) {
        ctx.logger.print('No plugins found in the official registry.');
        return 0;
    }
    for (const entry of entries) {
        const label = entry.displayName ?? entry.name;
        const alias = entry.alias ? ` (${entry.alias})` : '';
        const official = entry.official ? 'official' : 'community';
        const installable = entry.installable ? 'installable' : 'not-installable';
        ctx.logger.print(`${label}${alias}`);
        ctx.logger.print(`  package: ${entry.name}`);
        ctx.logger.print(`  trust: ${official}, ${installable}`);
        if (entry.description) {
            ctx.logger.print(`  ${entry.description}`);
        }
        ctx.logger.print('');
    }
    return 0;
}
