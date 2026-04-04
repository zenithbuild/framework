// ---------------------------------------------------------------------------
// preview.js — Zenith CLI V0
// ---------------------------------------------------------------------------
// Preview server with manifest-driven route resolution.
//
// This file is intentionally a composition facade. Implementation details
// live in ./preview/* modules.
// ---------------------------------------------------------------------------

export { createPreviewServer } from './preview/create-preview-server.js';
export { loadRouteManifest, loadRouteSurfaceState, matchRoute } from './preview/manifest.js';
export { executeServerRoute, executeServerScript } from './preview/server-runner.js';
export { injectSsrPayload } from './preview/payload.js';
export { toStaticFilePath, resolveWithinDist } from './preview/paths.js';
