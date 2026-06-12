import { resolveExtension } from '@zenithbuild/extension-registry';
import { readInstalledZenithMetadata } from '../../extensions/local-package.js';
import { formatResolvedExtension } from '../../extensions/resolve-alias.js';
import type { CommandContext } from '../shared/context.js';

export function runPluginInfo(ctx: CommandContext, query: string): number {
    if (!query) {
        ctx.logger.print('Usage: zenith plugin info <name|alias>');
        return 1;
    }
    const entry = resolveExtension(query, 'plugin');
    if (!entry) {
        ctx.logger.print(`Unknown plugin: ${query}`);
        return 1;
    }
    ctx.logger.print(formatResolvedExtension(entry));
    ctx.logger.print(`type: ${entry.type}`);
    ctx.logger.print(`official: ${entry.official ? 'yes' : 'no'}`);
    ctx.logger.print(`installable: ${entry.installable ? 'yes' : 'no'}`);
    if (entry.description) {
        ctx.logger.print(entry.description);
    }
    const installed = readInstalledZenithMetadata(ctx.projectRoot, entry.name);
    if (installed) {
        ctx.logger.print('Installed package metadata:');
        ctx.logger.print(JSON.stringify(installed, null, 2));
    } else {
        ctx.logger.print('Not installed in this project.');
    }
    return 0;
}
