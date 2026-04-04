import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
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

export async function loadRouteSurfaceState(distDir, fallbackBasePath = '/') {
  const manifestPath = join(distDir, 'assets', 'router-manifest.json');
  const resourceState = await loadResourceRouteManifest(distDir, normalizeBasePath(fallbackBasePath || '/'));
  try {
    const source = await readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(source);
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
  } catch {
    return {
      basePath: normalizeBasePath(resourceState.basePath || fallbackBasePath || '/'),
      pageRoutes: [],
      resourceRoutes: Array.isArray(resourceState.routes) ? resourceState.routes : []
    };
  }
}

export const matchRoute = matchManifestRoute;
