---
title: "Deployment Targets Guide"
description: "Choose a static site, a Node server, or a built-in serverless layout, then read each target's verification status, output directory, and deploy command."
version: "0.2"
status: "canonical"
last_updated: "2026-10-24"
tags: ["guides", "deployment", "build"]
section: "Deployment"
sectionOrder: 7
order: 1
---

# Deployment Targets Guide

Pick a target for the use case. Zenith does not auto-detect a host. `outDir` defaults to `dist` for every target. A Vercel prebuilt deploy sets `outDir` to `.vercel/output` in config.

## Static site

Use `static` or `static-export` when the site is prerendered files and a plain file host can serve them.

- `static` is the default. It copies prerendered files into `outDir`. Use it for a single page or routes that already have concrete files.
- `static-export` writes one concrete public file per path, nested under `basePath`. Dynamic prerender routes must declare `exportPaths`. A plain static file server is the contract, with no host rewrites.

Server routes, root global middleware, `/_zenith/image`, and `/__zenith/route-check` are not part of static output.

Whether plain `static` output serves dynamic prerender routes without host rewrites has not been verified. Use `static-export` when those routes must be concrete files.

## Node server

Use `node` when the app needs server routes, guards, root global middleware, advisory route-check, or resource downloads. The target emits a standalone Node artifact. Any host that can run Node can start it. Zenith has not live-verified a specific Node platform (VPS, Docker, or a PaaS).

```bash
ZENITH_PUBLIC_ORIGIN=https://app.example.com node dist/index.js
```

`PORT` defaults to `3000`. `HOST` defaults to `0.0.0.0`. Set `ZENITH_PUBLIC_ORIGIN` when the process sits behind TLS termination. The value must be an absolute `http` or `https` origin with no credentials, path, query, or hash. When that origin is HTTPS, route-owned session cookies include `Secure`.

## Serverless conveniences

`vercel`, `netlify`, `vercel-static`, and `netlify-static` map the same canonical `.zenith-output/` into those hosts' file layouts. They are built-in conveniences, not the default and not a Vercel-only product.

`vercel` and `netlify` package server-classified routes as hosted functions. `vercel-static` and `netlify-static` are prerender-only. These four targets are built and locally conformance-tested. They are not live-verified on Vercel or Netlify. Live dual-host smoke is deferred (JUD-22 path 2).

Cloudflare is not a built-in target. Static output can be uploaded to Cloudflare Pages as a recipe below. Zenith does not emit Cloudflare `_redirects` or `_routes.json`.

## Verification labels

| Label | Meaning |
| --- | --- |
| Conformance-tested | CI builds the target. For `vercel` and `netlify`, CI imports the emitted function modules in-process (`test:deployment-smoke` and the `adapter-hosted-*` specs). This does not deploy to the provider. |
| Locally served | A credential-free check serves the built `node` artifact or static `dist/` on the runner. That check is JUD-94 and is not claimed for the current train. Until it lands, `static` and `static-export` stay "CI-built (output shape checked)" and `node` stays "CI-built + in-process tested". |
| Live-verified | A real provider deployment passed a hosted smoke probe. No built-in target is live-verified. |
| Docs-only recipe | Upload steps for a host that has no Zenith adapter. |

Release notes copy these buckets from `docs/changelog/TEMPLATE.md` when a version is cut. CI Pipeline Engineer fills them from the JUD-94 conformance suite and credential-free smoke when that job exists. Do not treat this page as a live provider result.

## Target matrix

| target | Use case | Route support | Final output shape | Multipart POST | Streaming / SSE | Downloads | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `static` | Static site | Prerender only | Files copied to `outDir` | N/A | N/A | N/A | CI-built (output shape checked). Not live-verified on a host. |
| `static-export` | Static site | Prerender only | Rewrite-free concrete public files | N/A | N/A | N/A | CI-built (output shape checked). Not live-verified on a host. |
| `vercel-static` | Static site on Vercel | Prerender only | Build Output API: `static/` + `config.json` under `outDir` | N/A | N/A | N/A | Conformance-tested locally (output shape). Not live-verified on Vercel. |
| `netlify-static` | Static site on Netlify | Prerender only | Publish directory plus generated `_redirects` | N/A | N/A | N/A | Conformance-tested locally (output shape). Not live-verified on Netlify. |
| `vercel` | Serverless convenience | Prerender + hosted routes | Vercel Build Output API layout with route functions | Local conformance | Local conformance | Rejected at build time | Conformance-tested locally (emitted functions imported in-process). Not live-verified on Vercel. |
| `netlify` | Serverless convenience | Prerender + hosted routes | `publish/`, `functions/`, `netlify.toml` | Local conformance | Local conformance | Rejected at build time | Conformance-tested locally (emitted functions imported in-process). Not live-verified on Netlify. |
| `node` | Node server | Prerender + server routes | Standalone Node artifact | Support | Support | Support | CI-built + in-process tested. Not live-verified on a Node host. |

"Local conformance" means CI imports the emitted function module. It does not mean the provider accepted the deployment.

Static-only targets fail fast if the route manifest contains server-classified routes.

`static-export` also fails fast if a dynamic prerender route does not declare explicit `exportPaths`.

Root global middleware is server-only. If Zenith discovers `middleware.ts` or `middleware/index.ts`, static-family targets fail the build:

- `static`
- `static-export`
- `vercel-static`
- `netlify-static`

Global middleware is included for matched server page and resource routes in dev, preview, the packaged `node` artifact, and the emitted `vercel` and `netlify` function bundles. The hosted bundles are locally conformance-tested and not live-verified. Middleware does not run for static assets, image endpoints, static HTML, unmatched 404s, or route-check.

## Output directory and deploy command

`outDir` stays `dist` unless config sets it. Hosted commands below come from the internal live-smoke runbook. They are not live-verified.

| target | `outDir` to set | What to publish or run | Deploy command |
| --- | --- | --- | --- |
| `static` | `dist` (default) | The `outDir` directory | Upload that directory to a static host, or serve it with a plain file server |
| `static-export` | `dist` (default) | The `outDir` directory. Public files nest under `basePath`. | Same as `static`. A plain static file server is the contract. |
| `vercel-static` | `.vercel/output` for `vercel deploy --prebuilt` | `outDir/static` and `outDir/config.json` | `vercel deploy --prebuilt` |
| `netlify-static` | `dist` (default) | `outDir`, including generated `_redirects` | `netlify deploy --dir <outDir>` (`dist` when unset) |
| `vercel` | `.vercel/output` for `vercel deploy --prebuilt` | Build Output API layout at `outDir` | `vercel deploy --prebuilt` |
| `netlify` | `dist` (default) | `dist/publish` and `dist/functions` | `netlify deploy --dir dist/publish --functions dist/functions` |
| `node` | `dist` (default) | `dist/index.js` plus `static/`, `server/`, `manifest.json`, and `package.json` | `node dist/index.js` with `PORT`, `HOST`, and `ZENITH_PUBLIC_ORIGIN` when needed |

`npm run preview` is target-aware. It previews the built target. It is not a provider deploy.

## Static host upload recipes

These are docs-only recipes for `static` and `static-export` output. They are not new adapters, and they are not live-verified. Prefer `static-export` for a multi-route site that must not depend on host rewrites. A single page with no dynamic prerender routes can use `static`.

| Destination | Upload | Notes |
| --- | --- | --- |
| Vercel | `static` or `static-export` `outDir` (`dist` by default) | Static file upload. For a Build Output API layout, use the `vercel-static` target instead of this recipe. |
| Netlify | `static` or `static-export` `outDir` | Static file upload. For generated `_redirects`, use the `netlify-static` target instead of this recipe. |
| Cloudflare Pages | `static` or `static-export` `outDir` | Not a built-in target. Publish the out directory as static assets. Zenith does not emit Cloudflare `_redirects` or `_routes.json`. |
| GitHub Pages | `static-export` `outDir` for multi-route sites | Set `basePath` to `/<repository>` for a project site, or leave `basePath` at `/` for a user or organization site. |

Zenith does not emit a host `404.html` fallback. Configure the host when unknown paths should show a page.

Graduate to `node` when the site needs server routes, guards, root global middleware, advisory route-check, or downloads. Static-family targets reject those server features at build time.

## Contract: Canonical Build Output

Contract: `zenith build` always writes canonical intermediate output to `.zenith-output/` before adapting to the selected deployment target.

Invariant: route classification happens upstream in the manifest and server package layers.

Invariant: adapters package classified output into host layouts and must not reinterpret route meaning.

Definition of Done:

- `.zenith-output/manifest.json` describes classified routes.
- `.zenith-output/server/` is the canonical packaged server layer for server-capable targets.
- The selected target emits its final host layout under `outDir`.

## Base Path Contract

Zenith supports a single deployment base-path knob:

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

## Request body size

Zenith does not publish a Vercel or Netlify request-body limit. Earlier numeric limits on this page had no source and were removed. Check the host's current function payload limit before relying on multipart uploads. Zenith does not implement resumable or chunked upload proxying. Multipart parsing on emitted `vercel` and `netlify` functions is part of the local conformance suite. That is not a live provider measurement.

## Current limitations

- There is no separate `assetPrefix` knob. Public assets intentionally follow `basePath` so the URL model stays single-source and deterministic.
- `/_zenith/image` is emitted for `node`, `vercel`, and `netlify` on the same packaged image contract. It only optimizes images when the build used `@zenithbuild/image` (see [Optimized Images](/docs/guides/styling-and-public-assets#optimized-images)). Without the package, every target answers image requests with a `400` JSON error. A request without `url` returns `missing_url`, one without a width returns `invalid_width`, and a local image returns `image_request_failed`. A remote URL that `images.remotePatterns` disallows gets the usual remote-pattern error. An allowed remote URL returns `image_request_failed` with a message saying it requires `@zenithbuild/image`, so install the package and rebuild. When the package is used, packaged `node` output declares the Sharp range in its generated `package.json`, so install dependencies in that output before starting it. Local conformance imported built `node`, `vercel`, and `netlify` output on 2026-10-23. Hosted Vercel and Netlify deploys have not been live-verified.
- Remote image optimization only fetches URLs allowed by `images.remotePatterns`. The image endpoint validates the resolved remote target before fetch, repeats that validation for redirects, and fetches through the validated target while preserving the original host semantics.
- `bundler-owned final build/static HTML image materialization` remains the hard boundary; runtime paths only consume route artifacts.
- `/__zenith/route-check` runs in local dev/preview and on the packaged `node` target as an advisory soft-navigation preflight. Built-in `vercel` and `netlify` adapters emit the same endpoint. CI conformance-tests that output by importing the emitted modules. Those hosted targets are not live-verified. Server-side `guard(ctx)` / `load(ctx)` remains the security boundary for direct requests.
- Emitted `vercel` and `netlify` functions include `multipart/form-data` parsing plus resource-route `stream(...)` and `sse(...)` in the local conformance suite. Provider buffering and payload limits are not live-verified.
- **Hosted downloads:** direct `ctx.download()` resource routes are rejected at build time for `vercel` and `netlify`. Generated hosted wrappers still include a defensive 501 fallback if a download-shaped response reaches them. Packaged `node` supports resource downloads in the local artifact. Hosted downloads remain unimplemented. That gap is separate from route-check.

## Adapter rule

If you are implementing or reviewing adapters, keep this boundary hard:

- Manifest classifies routes.
- Server packaging writes `.zenith-output/server/`.
- Adapters only map packaged output into host-specific file and function layouts.

If an adapter starts inferring route meaning on its own, it is breaking the deployment contract.
