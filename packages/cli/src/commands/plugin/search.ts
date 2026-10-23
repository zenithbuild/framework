import { searchExtensions } from '../../extensions/registry.js';
import type { CommandContext } from '../shared/context.js';

export function runPluginSearch(ctx: CommandContext, term: string): number {
    if (!term) {
        ctx.logger.print('Usage: zenith plugin search <term>');
        return 1;
    }
    const entries = searchExtensions(term, 'plugin');
    if (entries.length === 0) {
        ctx.logger.print(`No plugins matched "${term}".`);
        return 0;
    }
    for (const entry of entries) {
        ctx.logger.print(`${entry.displayName ?? entry.name} (${entry.alias ?? entry.name})`);
        ctx.logger.print(`  ${entry.name}`);
    }
    return 0;
}
