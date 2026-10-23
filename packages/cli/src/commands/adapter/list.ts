import { KNOWN_TARGETS } from '../../adapters/adapter-types.js';
import { listExtensions } from '../../extensions/registry.js';
import type { CommandContext } from '../shared/context.js';

export function runAdapterList(ctx: CommandContext): number {
    const entries = listExtensions('adapter');
    ctx.logger.print('Official adapters:');
    for (const entry of entries) {
        const label = entry.displayName ?? entry.name;
        const alias = entry.alias ? ` (${entry.alias})` : '';
        const installable = entry.installable ? 'installable' : 'not-installable';
        const fallback = entry.fallbackTarget ? `, fallback target: ${entry.fallbackTarget}` : '';
        ctx.logger.print(`  ${label}${alias} — ${entry.name} [${installable}${fallback}]`);
    }
    ctx.logger.print('');
    ctx.logger.print('Built-in targets:');
    for (const target of KNOWN_TARGETS) {
        ctx.logger.print(`  ${target}`);
    }
    return 0;
}
