---
title: "Deployment Targets Guide"
description: "Canonical target matrix for Zenith build output, preview behavior, and current deployment limitations."
version: "0.1"
status: "canonical"
last_updated: "2026-03-24"
tags: ["guides", "deployment", "build"]
---

# Deployment Targets Guide

## Contract: Canonical Build Output

Contract: `zenith build` always writes canonical intermediate output to `.zenith-output/` before adapting to the selected deployment target.

Invariant: route classification happens upstream in the manifest and server package layers.

Invariant: adapters package classified output into host layouts and must not reinterpret route meaning.

Definition of Done:
- `.zenith-output/manifest.json` describes classified routes.
- `.zenith-output/server/` is the canonical packaged server layer for server-capable targets.
- The selected target emits its final host layout under `outDir`.

## Target Matrix

| target | Route support | Final output shape |
| --- | --- | --- |
| `static` | Prerender only | `dist/` static site |
| `vercel-static` | Prerender only | Vercel Build Output API static layout rooted at `outDir` |
| `netlify-static` | Prerender only | Netlify publish layout rooted at `outDir` with generated `_redirects` |
| `vercel` | Prerender + server routes | Vercel Build Output API layout with packaged route functions |
| `netlify` | Prerender + server routes | Netlify deploy root with `publish/`, `functions/`, `_redirects`, and `netlify.toml` |
| `node` | Prerender + server routes | Standalone Node artifact with `index.js`, `package.json`, `manifest.json`, `static/`, and `server/` |

Static-only targets fail fast if the route manifest contains server-classified routes.

## Base Path Contract

Zenith now supports a single deployment base-path knob:

```ts
export default defineConfig({
  target: 'static',
  basePath: '/docs'
});
```

`basePath` is the public mount point for the app. It defaults to `/`.

There is intentionally no separate `assetPrefix` config in this milestone.

Invariant: route identity stays canonical and base-path free in the route manifest.

Invariant: public Zenith URLs are base-path aware.

This means `basePath` prefixes:

- public JS and CSS asset URLs
- client router bundle URLs
- framework endpoints such as `/_zenith/image` and `/__zenith/route-check`
- app-local redirects returned by server route execution
- preview and Node runtime public serving behavior

This does not mean static output files are nested under the base path. Canonical emitted files stay adapter-neutral. Adapters map the classified output to host-specific public routing.

### URL Invariants

Canonical route paths:

- stay base-path free
- continue to identify route meaning, matching, and classification
- are what `render_mode` and `path_kind` describe

Public app URLs:

- are `basePath + canonical route path`
- are what users, browsers, and host rewrites see

Examples with `basePath: '/docs'`:

- canonical route `/` is publicly served at `/docs`
- canonical route `/about` is publicly served at `/docs/about`
- canonical route `/guides/:slug` is publicly served at `/docs/guides/:slug`
- canonical asset `/assets/app.js` is publicly served at `/docs/assets/app.js`
- canonical image endpoint `/_zenith/image` is publicly served at `/docs/_zenith/image`

### Manifest Invariants

`.zenith-output/manifest.json` must carry:

- `base_path`
- canonical `routes[].path`
- base-path-prefixed public `assets`
- canonical static output `routes[].html`

`.zenith-output/server/manifest.json` and packaged `route.json` must also carry `base_path` so server runtimes reconstruct public URLs correctly.

### Router And SSR Invariants

Client router:

- matches canonical routes after stripping `basePath` from `window.location.pathname`
- fetches route-check data from the base-path-prefixed `__zenith/route-check` endpoint
- treats links outside the configured base path as external to SPA navigation

SSR and packaged server runtimes:

- reconstruct `ctx.url.pathname` as the public path, including `basePath`
- reconstruct `ctx.url.origin` from trusted server origin config or the bound listener, never from raw request `Host`
- keep route classification canonical and base-path free upstream
- prefix app-local redirects such as `/login` to `/docs/login`

Image runtime:

- prefixes optimized local image URLs with `basePath`
- prefixes the endpoint URL for remote optimization with `basePath`
- keeps on-disk optimized image artifacts base-path free
- materializes `<Image />` markup from route-scoped compiler/bundler artifacts and does not execute page assets during build, preview, or server render
- currently requires static image props during materialization; dynamic image props are unsupported until a dedicated compiler artifact exists

Adapter rule:

- adapters consume `base_path`
- adapters map public source patterns to canonical emitted files/functions
- adapters must not reinterpret route meaning, route classification, or router semantics

## Preview Contract

`zenith preview` is target-aware.

- For static targets, preview serves the built static output for the selected target contract.
- For `node`, preview boots the built Node artifact instead of pretending static serving is sufficient.
- Preview must preserve the same route classification semantics as build output.
- Preview honors `basePath` for app routes, asset URLs, route-check, and the image endpoint.

## Scaffold Baseline

`create-zenith` templates currently scaffold this deployment baseline:

- `pagesDir: 'src/pages'`
- `target: 'static'`
- `typescriptDefault: true`

The basic template also keeps `router: false` explicit as part of its single-page baseline.

## Current Limitations

- There is no separate `assetPrefix` knob. Public assets intentionally follow `basePath` so the URL model stays single-source and deterministic.
- `/_zenith/image` is deployed by the `node` target today. Other server-capable targets do not yet emit a deployed image endpoint.
- `/__zenith/route-check` is deployed by local dev/preview and the packaged `node` target. Hosted `vercel` and `netlify` targets currently skip advisory route-check and rely on the direct HTML request instead.
- Hosted verification for Vercel and Netlify should still be treated as an operational validation step outside the local build contract.

## Adapter Rule

If you are implementing or reviewing adapters, keep this boundary hard:

- Manifest classifies routes.
- Server packaging writes `.zenith-output/server/`.
- Adapters only map packaged output into host-specific file and function layouts.

If an adapter starts inferring route meaning on its own, it is breaking the deployment contract.
