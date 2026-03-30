---
title: "Deployment Targets Guide"
description: "Canonical target matrix for Zenith build output, preview behavior, and current deployment limitations."
version: "0.2"
status: "canonical"
last_updated: "2026-03-30"
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
| `static-export` | Prerender only with explicit concrete export paths for dynamic routes | Rewrite-free concrete public files rooted at `outDir` |
| `vercel-static` | Prerender only | Vercel Build Output API static layout rooted at `outDir` |
| `netlify-static` | Prerender only | Netlify publish layout rooted at `outDir` with generated `_redirects` |
| `vercel` | Prerender + hosted page routes + hosted resource `json(...)` / `text(...)` routes + hosted image endpoint | Vercel Build Output API layout with packaged hosted route functions |
| `netlify` | Prerender + hosted page routes + hosted resource `json(...)` / `text(...)` routes + hosted image endpoint | Netlify deploy root with `publish/`, `functions/`, `_redirects`, and `netlify.toml` |
| `node` | Prerender + server routes | Standalone Node artifact with `index.js`, `package.json`, `manifest.json`, `static/`, and `server/` |

Static-only targets fail fast if the route manifest contains server-classified routes.

`static-export` also fails fast if a dynamic prerender route does not declare explicit `exportPaths`.

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
- framework endpoints such as `/_zenith/image` and `/__zenith/route-check` when the selected target exposes them
- app-local redirects returned by server route execution
- preview and Node runtime public serving behavior

This does not mean canonical intermediate files are nested under the base path. `.zenith-output/static` stays adapter-neutral and base-path free. Final target output may still physically nest files under `basePath` when the selected target needs direct-file serving. `static-export` does this intentionally.

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
- optional `routes[].export_paths` for prerendered dynamic routes with an explicit concrete export contract
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
- uses bundler-owned final build/static HTML image materialization from route-scoped compiler artifacts, while preview and server render continue to materialize at runtime from route metadata; no path executes page assets
- currently requires static image props during materialization; dynamic image props are unsupported until a dedicated compiler artifact exists

Adapter rule:

- adapters consume `base_path`
- adapters map public source patterns and/or concrete public files to canonical emitted files/functions
- adapters must not reinterpret route meaning, route classification, or router semantics

## Static Export Contract

`target: 'static-export'` is Zenith's explicit rewrite-free static deployment mode.

It uses the existing upstream route truth:

- `render_mode: 'prerender' | 'server'`
- canonical `routes[].path`
- optional `routes[].export_paths`

It does not reinterpret route meaning inside the adapter.

Rules:

- any `render_mode: 'server'` route is a build error
- any dynamic prerender route without `exportPaths` is a build error
- `exportPaths` must be declared as `export const exportPaths = [...]` inside `<script server lang="ts">`
- `exportPaths` entries must be literal concrete pathnames that match the route pattern
- final output under `outDir` is directly serveable by a plain static file server
- no rewrites, manifest lookup at request time, or server runtime are required for direct requests

Operational boundary:

- no deployed `/_zenith/image` endpoint
- no deployed `/__zenith/route-check` endpoint
- no edge/runtime claim
- `.zenith-output/server/` remains outside the runtime path for this target

## Preview Contract

`zenith preview` is target-aware.

- For static targets, preview serves the built static output for the selected target contract.
- For `static-export`, preview serves the concrete exported file tree directly.
- For `node`, preview boots the built Node artifact instead of pretending static serving is sufficient.
- Preview must preserve the same route classification semantics as build output.
- Preview honors `basePath` for app routes, asset URLs, and framework endpoints when the selected target exposes them.

## Scaffold Baseline

`create-zenith` templates currently scaffold this deployment baseline:

- `pagesDir: 'src/pages'`
- `target: 'static'`
- `typescriptDefault: true`

The basic template also keeps `router: false` explicit as part of its single-page baseline.

## Current Limitations

- There is no separate `assetPrefix` knob. Public assets intentionally follow `basePath` so the URL model stays single-source and deterministic.
- `/_zenith/image` is deployed by `node`, `vercel`, and `netlify` on the same packaged image contract today. `static-export` does not emit a deployed image endpoint.
- `/__zenith/route-check` is deployed by local dev/preview and the packaged `node` target. Hosted `vercel` and `netlify` targets currently skip advisory route-check and rely on the direct HTML request instead.
- Hosted `vercel` and `netlify` targets now package page-route server execution, including page-route redirects and cookie-session `Set-Cookie` responses, on the same packaged server contract as `node`.
- Hosted `vercel` and `netlify` targets now host explicit resource routes for `json(...)`, `text(...)`, `redirect(...)`, and `deny(...)`, including auth and staged-cookie behavior on those supported resource responses.
- Hosted `vercel` and `netlify` targets now host the existing `/_zenith/image` runtime endpoint with the same packaged-node response contract for JSON errors, binary image bodies, `Content-Type`, and `Cache-Control`.
- Hosted `vercel` and `netlify` targets still do not host `download(...)`, hosted multipart resource writes, or hosted route-check in this milestone.
- `static-export` does not expose a route-check endpoint. Direct public file serving is the contract.

## Adapter Rule

If you are implementing or reviewing adapters, keep this boundary hard:

- Manifest classifies routes.
- Server packaging writes `.zenith-output/server/`.
- Adapters only map packaged output into host-specific file and function layouts.

If an adapter starts inferring route meaning on its own, it is breaking the deployment contract.
