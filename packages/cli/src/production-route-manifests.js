import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

async function writeManifest(dir, name, manifest) {
    const assets = join(dir, 'assets');
    await mkdir(assets, { recursive: true });
    await writeFile(join(assets, name), JSON.stringify(manifest) + '\n', 'utf8');
}

function publicPage(route) {
    return {
        path: route.path,
        output: route.output,
        html: route.html,
        page_asset: route.page_asset,
        prerender: route.prerender,
        ...(route.prerender && route.ssr_data != null ? { ssr_data: route.ssr_data } : {}),
        has_guard: route.has_guard,
        has_load: route.has_load,
        has_action: route.has_action,
        has_scoped_server_data: route.has_scoped_server_data,
        image_materialization: route.image_materialization
    };
}

export function pageUsesServerMetadata({ ir }) {
    return Boolean(ir.server_script || ir.has_scoped_server_data || ir.has_guard || ir.has_load || ir.has_action);
}

export async function writeProductionPageManifests(staticDir, privateDir, envelopes) {
    const name = 'router-manifest.json';
    let manifest;
    try {
        manifest = JSON.parse(await readFile(join(staticDir, 'assets', name), 'utf8'));
    } catch (error) {
        const needsServerRoutes = envelopes.some(pageUsesServerMetadata);
        if (error.code === 'ENOENT' && !needsServerRoutes) return;
        throw error;
    }
    const byPath = new Map(envelopes.map(({ route, ir }) => [route, ir]));
    const routes = manifest.routes.map((route) => {
        const ir = byPath.get(route.path);
        if (!ir) {
            throw new Error('Missing compiler output for route ' + route.path);
        }
        return {
            ...route,
            server_script: ir.server_script?.source ?? null,
            server_script_path: ir.server_script?.source_path ?? null,
            has_guard: ir.has_guard === true,
            has_load: ir.has_load === true,
            has_action: ir.has_action === true,
            guard_module_ref: ir.guard_module_ref ?? null,
            load_module_ref: ir.load_module_ref ?? null,
            action_module_ref: ir.action_module_ref ?? null,
            has_scoped_server_data: ir.has_scoped_server_data === true,
            scoped_server_data: ir.scoped_server_data ?? []
        };
    });
    await writeManifest(privateDir, name, { base_path: manifest.base_path, routes });
    // Older native binaries can include build metadata. Write the public fields explicitly.
    await writeManifest(staticDir, name, { base_path: manifest.base_path, routes: routes.map(publicPage) });
}

export async function writePublicResourceManifest(staticDir, basePath, resources, hasServerPages) {
    const routes = resources.map(({ path, route_kind, params, has_guard, has_load, has_action }) => (
        { path, route_kind, params, has_guard, has_load, has_action }
    ));
    await writeManifest(staticDir, 'resource-manifest.json', {
        base_path: basePath,
        requires_server_metadata: hasServerPages || routes.length > 0,
        requires_server_pages: hasServerPages,
        routes
    });
}
