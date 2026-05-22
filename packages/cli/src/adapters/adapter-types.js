export const KNOWN_TARGETS = [
    'static',
    'static-export',
    'vercel-static',
    'netlify-static',
    'vercel',
    'netlify',
    'node'
];

/**
 * @typedef {'static' | 'static-export' | 'vercel-static' | 'netlify-static' | 'vercel' | 'netlify' | 'node'} ZenithTarget
 */

/**
 * @typedef {'prerender' | 'server'} ZenithRenderMode
 */

/**
 * @typedef {'static' | 'dynamic'} ZenithPathKind
 */

/**
 * @typedef {{
 *   path: string,
 *   file: string,
 *   path_kind: ZenithPathKind,
 *   render_mode: ZenithRenderMode,
 *   params: string[],
 *   export_paths?: string[]
 * }} RouteManifestEntry
 */

/**
 * @typedef {{
 *   schema_version: number,
 *   zenith_version: string,
 *   target: string,
 *   base_path: string,
 *   content_hash: string,
 *   global_middleware?: { source_file: string },
 *   routes: Array<{
 *     path: string,
 *     file: string,
 *     path_kind: ZenithPathKind,
 *     render_mode: ZenithRenderMode,
 *     requires_hydration: boolean,
 *     params: string[],
 *     export_paths?: string[],
 *     html: string,
 *     assets: string[]
 *   }>,
 *   assets: {
 *     js: string[],
 *     css: string[],
 *     vendor: string | null
 *   }
 * }} BuildManifest
 */

/**
 * @typedef {{
 *   coreOutput: string,
 *   outDir: string,
 *   manifest: BuildManifest,
 *   config: object
 * }} AdaptOptions
 */

/**
 * @typedef {{
 *   name: string,
 *   validateRoutes: (manifest: RouteManifestEntry[]) => void,
 *   adapt: (options: AdaptOptions) => Promise<void>
 * }} ZenithAdapter
 */
