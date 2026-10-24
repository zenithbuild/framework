import { cp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

export const staticAdapter = {
    name: 'static',
    validateRoutes(manifest) {
        const serverRoutes = manifest.filter((entry) => entry.render_mode === 'server');
        if (serverRoutes.length === 0) {
            return;
        }

        const first = serverRoutes[0];
        throw new Error(
            `[Zenith:Build] target "static" cannot emit server-rendered routes. ` +
            `Route "${first.path}" (${first.file}) requires render_mode="server".`
        );
    },
    async adapt(options) {
        const staticDir = join(options.coreOutput, 'static');
        await rm(options.outDir, { recursive: true, force: true });
        await mkdir(options.outDir, { recursive: true });
        await cp(staticDir, options.outDir, { recursive: true, force: true });
    }
};
