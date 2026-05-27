import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createVercelBasePathAssetRoutes, createVercelRouteSource } from './route-rules.js';
import type { AdapterDriver, BuildManifest } from './adapter-types.js';

function createConfig(manifest: BuildManifest) {
    return {
        version: 3,
        routes: [
            ...createVercelBasePathAssetRoutes(manifest.base_path),
            { handle: 'filesystem' },
            ...manifest.routes.map((route) => ({
                src: createVercelRouteSource(route.path, manifest.base_path),
                dest: route.html
            }))
        ]
    };
}

export const vercelStaticAdapter: AdapterDriver = {
    name: 'vercel-static',
    validateRoutes(manifest) {
        const serverRoutes = manifest.filter((entry) => entry.render_mode === 'server');
        if (serverRoutes.length === 0) {
            return;
        }

        const first = serverRoutes[0];
        throw new Error(
            `[Zenith:Build] target "vercel-static" cannot emit server-rendered routes. ` +
            `Route "${first.path}" (${first.file}) requires render_mode="server".`
        );
    },
    async adapt(options) {
        const staticDir = join(options.coreOutput, 'static');
        const vercelStaticDir = join(options.outDir, 'static');
        await rm(options.outDir, { recursive: true, force: true });
        await mkdir(vercelStaticDir, { recursive: true });
        await cp(staticDir, vercelStaticDir, { recursive: true, force: true });
        await writeFile(
            join(options.outDir, 'config.json'),
            `${JSON.stringify(createConfig(options.manifest), null, 2)}\n`,
            'utf8'
        );
    }
};
