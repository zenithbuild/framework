import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { resolveConfigOutDir } from '../config.js';
import { normalizeBasePath } from '../base-path.js';
import { loadResourceRouteManifest } from '../resource-manifest.js';
import {
  compareRouteSpecificity,
  matchRoute as matchManifestRoute
} from '../server/resolve-request-route.js';

/**
 * @typedef {{
 *   path: string;
 *   output: string;
 *   server_script?: string | null;
 *   server_script_path?: string | null;
 *   prerender?: boolean;
 *   route_id?: string;
 *   pattern?: string;
 *   params_shape?: Record<string, string>;
 *   has_guard?: boolean;
 *   has_load?: boolean;
 *   guard_module_ref?: string | null;
 *   load_module_ref?: string | null;
 * }} PreviewRoute
 */

/**
 * @param {string} distDir
 * @returns {Promise<PreviewRoute[]>}
 */
export async function loadRouteManifest(distDir) {
  const state = await loadRouteSurfaceState(distDir, '/');
  return state.pageRoutes;
}

export async function loadRouteSurfaceState(distDir, fallbackBasePath = '/', { strict = false, allowMissingPages = false } = {}) {
  const manifestPath = join(distDir, 'assets', 'router-manifest.json');
  const resourceState = await loadResourceRouteManifest(distDir, normalizeBasePath(fallbackBasePath || '/'), strict);
  try {
    const source = await readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(source);
    if (strict && !Array.isArray(parsed?.routes)) throw new Error('Invalid page route manifest');
    const routes = Array.isArray(parsed?.routes) ? parsed.routes : [];
    const basePath = normalizeBasePath(parsed?.base_path || resourceState.basePath || fallbackBasePath || '/');
    return {
      basePath,
      pageRoutes: routes
        .filter((entry) =>
          entry &&
          typeof entry === 'object' &&
          typeof entry.path === 'string' &&
          typeof entry.output === 'string'
        )
        .sort((a, b) => compareRouteSpecificity(a.path, b.path)),
      resourceRoutes: Array.isArray(resourceState.routes) ? resourceState.routes : []
    };
  } catch (error) {
    if (strict && !(allowMissingPages && error.code === 'ENOENT')) throw error;
    return {
      basePath: normalizeBasePath(resourceState.basePath || fallbackBasePath || '/'),
      pageRoutes: [],
      resourceRoutes: Array.isArray(resourceState.routes) ? resourceState.routes : []
    };
  }
}

function matchesRouteInventory(expected, loaded) {
  if (!Array.isArray(expected) || expected.length !== loaded.length) return false;
  const byPath = new Map(loaded.map((route) => [route.path, route]));
  if (byPath.size !== loaded.length) return false;
  return expected.every((entry) => {
    const route = byPath.get(entry?.path);
    if (!route || route.output !== entry.output || Boolean(route.prerender) !== Boolean(entry.prerender)) return false;
    byPath.delete(entry.path);
    for (const kind of ['guard', 'load', 'action']) {
      if (Boolean(route['has_' + kind]) !== Boolean(entry['has_' + kind])) return false;
      if (entry['has_' + kind] && !route.server_script && !route[kind + '_module_ref']) return false;
    }
    return Boolean(route.has_scoped_server_data) === Boolean(entry.has_scoped_server_data);
  });
}

async function readPublicPages(distDir, resources) {
  try {
    const manifest = JSON.parse(await readFile(join(distDir, 'assets', 'router-manifest.json'), 'utf8'));
    if (!Array.isArray(manifest.routes)) return null;
    if (manifest.routes.length === 0 && (resources.requires_server_pages || (resources.requires_server_metadata && !resources.routes.length))) {
      return null;
    }
    return manifest.routes;
  } catch (error) {
    // Resource-only projects have no page manifest. Older outputs have no explicit page flag.
    if (error.code === 'ENOENT' && !resources.requires_server_pages && (resources.routes.length || !resources.requires_server_metadata)) {
      return [];
    }
    return null;
  }
}

export async function resolvePreviewRouteFiles(distDir, projectRoot, config) {
  const packagedServer = join(dirname(distDir), 'server');
  const legacy = {
    serverDir: packagedServer,
    routeDir: distDir,
    bindingPlan: join(distDir, '_zenith', 'ssr-bindings.json')
  };
  let publicManifest;
  try {
    publicManifest = JSON.parse(await readFile(join(distDir, 'assets', 'resource-manifest.json'), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return legacy;
    }
    throw error;
  }
  if (typeof publicManifest.requires_server_metadata !== 'boolean') {
    return legacy;
  }

  if (!Array.isArray(publicManifest.routes)) return null;
  const fallback = publicManifest.requires_server_metadata ? null : legacy;
  const publicPages = await readPublicPages(distDir, publicManifest);
  if (!publicPages) return fallback;

  const candidates = [packagedServer];
  if (resolve(distDir) === resolveConfigOutDir(projectRoot, config)) {
    candidates.push(join(projectRoot, '.zenith-output', 'server'));
  }
  for (const serverDir of candidates) {
    const routeDir = join(serverDir, 'preview');
    let routeState;
    try {
      routeState = await loadRouteSurfaceState(routeDir, publicManifest.base_path, {
        strict: true,
        allowMissingPages: publicPages.length === 0
      });
    } catch {
      continue;
    }
    if (routeState.basePath !== normalizeBasePath(publicManifest.base_path || '/')) continue;
    if (!matchesRouteInventory(publicPages, routeState.pageRoutes)) continue;
    if (!matchesRouteInventory(publicManifest.routes, routeState.resourceRoutes)) continue;
    return { serverDir, routeDir, routeState, bindingPlan: join(serverDir, 'ssr-bindings.json') };
  }
  return fallback;
}

export const matchRoute = matchManifestRoute;
