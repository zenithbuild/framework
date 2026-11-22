import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { resolveConfigOutDir } from '../config.js';
import { fileExists } from './paths.js';
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

  const candidates = [packagedServer];
  if (resolve(distDir) === resolveConfigOutDir(projectRoot, config)) {
    candidates.push(join(projectRoot, '.zenith-output', 'server'));
  }
  for (const serverDir of candidates) {
    const routeDir = join(serverDir, 'preview');
    if (await fileExists(join(routeDir, 'assets', 'resource-manifest.json'))) {
      return { serverDir, routeDir, bindingPlan: join(serverDir, 'ssr-bindings.json') };
    }
  }
  return publicManifest.requires_server_metadata ? null : legacy;
}

export const matchRoute = matchManifestRoute;
