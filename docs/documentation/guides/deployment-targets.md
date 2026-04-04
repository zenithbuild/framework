---
title: "Deployment Targets Guide"
description: "Canonical target matrix for Zenith build output, preview behavior, and current deployment limitations."
version: "0.2"
status: "canonical"
last_updated: "2026-04-01"
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

| target | Route support | Final output shape | Multipart POST | Streaming / SSE | Downloads |
| --- | --- | --- | --- | --- | --- |
| `static` | Prerender only | `dist/` static site | N/A | N/A | N/A |
| `static-export` | Prerender only | Rewrite-free concrete public files | N/A | N/A | N/A |
| `vercel` | Prerender + Hosted Routes | Vercel Build Output API layout | Support | Support | Deferred (501) |
| `netlify` | Prerender + Hosted Routes | Netlify deploy root | Support | Support | Deferred (501) |
| `node` | Prerender + Server Routes | Standalone Node artifact | Support | Support | Support |

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

### Hosted Environment Body Limits

When using multipart uploads on hosted platforms, be aware of the following request body size limits enforced by the platform providers:

- **Vercel**: 4.5 MB (Serverless Functions limit)
- **Netlify**: 6.0 MB (Lambda limit)

For larger files, we recommend using a direct-to-storage upload strategy (e.g., S3 Presigned URLs), as Zenith does not currently implement a resumable upload or chunked binary streaming proxy.

## Current Limitations

- There is no separate `assetPrefix` knob. Public assets intentionally follow `basePath` so the URL model stays single-source and deterministic.
- `/_zenith/image` is deployed by `node`, `vercel`, and `netlify` on the same packaged image contract today.
- `bundler-owned final build/static HTML image materialization` remains the hard boundary; runtime paths only consume route artifacts.
- `/__zenith/route-check` is deployed by local dev/preview and the packaged `node` target. Hosted `vercel` and `netlify` targets currently skip advisory route-check and rely on the direct HTML request instead.
- Hosted `vercel` and `netlify` targets now support `multipart/form-data` parsing plus resource-route `stream(...)` and `sse(...)`.
- **Hosted Downloads**: `ctx.download()` returns a 501 on hosted targets (`vercel`, `netlify`) in this milestone.

## Adapter Rule

If you are implementing or reviewing adapters, keep this boundary hard:

- Manifest classifies routes.
- Server packaging writes `.zenith-output/server/`.
- Adapters only map packaged output into host-specific file and function layouts.

If an adapter starts inferring route meaning on its own, it is breaking the deployment contract.
