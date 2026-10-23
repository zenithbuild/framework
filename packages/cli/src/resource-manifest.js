import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compareRouteSpecificity } from './server/resolve-request-route.js';

function sanitizeResourceRoute(entry) {
    if (!entry || typeof entry !== 'object') {
        return null;
    }
    if (typeof entry.path !== 'string' || typeof entry.server_script !== 'string') {
        return null;
    }
    return {
        path: entry.path,
        file: typeof entry.file === 'string' ? entry.file : '',
        route_kind: 'resource',
        server_script: entry.server_script,
        server_script_path: typeof entry.server_script_path === 'string' ? entry.server_script_path : '',
        has_guard: entry.has_guard === true,
        has_load: entry.has_load === true,
        has_action: entry.has_action === true,
        params: Array.isArray(entry.params) ? entry.params.filter((value) => typeof value === 'string') : [],
        route_id: typeof entry.route_id === 'string' ? entry.route_id : null
    };
}

export async function writeResourceRouteManifest(staticDir, routeManifest, basePath = '/') {
    const routes = (Array.isArray(routeManifest) ? routeManifest : [])
        .filter((entry) => entry?.route_kind === 'resource')
        .map((entry) => sanitizeResourceRoute(entry))
        .filter(Boolean)
        .sort((left, right) => compareRouteSpecificity(left.path, right.path));

    const manifestPath = join(staticDir, 'assets', 'resource-manifest.json');
    await mkdir(join(staticDir, 'assets'), { recursive: true });
    await writeFile(
        manifestPath,
        `${JSON.stringify({ base_path: basePath, routes }, null, 2)}\n`,
        'utf8'
    );
    return routes;
}

export async function loadResourceRouteManifest(distDir, fallbackBasePath = '/') {
    const manifestPath = join(distDir, 'assets', 'resource-manifest.json');
    try {
        const parsed = JSON.parse(await readFile(manifestPath, 'utf8'));
        return {
            basePath: typeof parsed?.base_path === 'string' ? parsed.base_path : fallbackBasePath,
            routes: (Array.isArray(parsed?.routes) ? parsed.routes : [])
                .map((entry) => sanitizeResourceRoute(entry))
                .filter(Boolean)
                .sort((left, right) => compareRouteSpecificity(left.path, right.path))
        };
    } catch {
        return {
            basePath: fallbackBasePath,
            routes: []
        };
    }
}
