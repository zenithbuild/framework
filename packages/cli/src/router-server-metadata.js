import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function injectImageMaterializationIntoRouterManifest(distDir, envelopes) {
    const manifestPath = join(distDir, 'assets', 'router-manifest.json');
    let parsed;

    try {
        parsed = JSON.parse(await readFile(manifestPath, 'utf8'));
    } catch {
        return;
    }

    const routes = Array.isArray(parsed?.routes) ? parsed.routes : null;
    if (!routes) {
        return;
    }

    const serverMetadataByRoute = new Map();
    for (const envelope of Array.isArray(envelopes) ? envelopes : []) {
        const route = typeof envelope?.route === 'string' ? envelope.route : '';
        if (!route) {
            continue;
        }
        const routeIr = envelope?.ir && typeof envelope.ir === 'object' ? envelope.ir : {};
        serverMetadataByRoute.set(route, {
            guard_module_ref: routeIr.guard_module_ref || null,
            load_module_ref: routeIr.load_module_ref || null,
            action_module_ref: routeIr.action_module_ref || null,
            has_guard: routeIr.has_guard === true,
            has_load: routeIr.has_load === true,
            has_action: routeIr.has_action === true
        });
    }

    for (const route of routes) {
        const routePath = typeof route?.path === 'string' ? route.path : '';
        if (!routePath) {
            continue;
        }
        const serverMetadata = serverMetadataByRoute.get(routePath);
        if (!serverMetadata) {
            continue;
        }
        route.guard_module_ref = serverMetadata.guard_module_ref;
        route.load_module_ref = serverMetadata.load_module_ref;
        route.action_module_ref = serverMetadata.action_module_ref;
        route.has_guard = serverMetadata.has_guard;
        route.has_load = serverMetadata.has_load;
        route.has_action = serverMetadata.has_action;
    }

    await writeFile(manifestPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
}
